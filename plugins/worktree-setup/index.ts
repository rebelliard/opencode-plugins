import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  matchWorktree,
  parseWorktrees,
  type ReadyWorktree,
  readReady,
  scriptFromConfig,
  scriptFromDirectory,
} from "./config.ts";

const exec = promisify(execFile);
const SOURCE_ENV = [
  "WORKTREE_SETUP_SOURCE_WORKTREE",
  "MAIN_WORKTREE",
  "ROOT_WORKTREE_PATH",
] as const;

interface Context {
  location: {
    directory: string;
    project: { id?: string; canonical?: string };
  };
  options?: unknown;
  event?: {
    subscribe?(options: { signal: AbortSignal }): AsyncIterable<unknown>;
  };
}

export interface Deps {
  /** Parent directory for per-worktree lock directories. */
  lockRoot: string;
  log(message: string, error: unknown): void;
}

const defaultDeps: Deps = {
  lockRoot: tmpdir(),
  log: (message, error) => {
    console.error(message, error);
  },
};

/** Path of the lock directory that guards one worktree's setup run. */
export function lockPath(lockRoot: string, directory: string): string {
  return path.join(
    lockRoot,
    `opencode-worktree-setup-${createHash("sha256").update(directory).digest("hex")}`,
  );
}

/**
 * Runs a repo's worktree setup script after OpenCode creates a worktree.
 * The script path comes from plugin options or `.opencode/worktree-setup.json`.
 */
export function createWorktreeSetup(overrides: Partial<Deps> = {}) {
  const deps: Deps = { ...defaultDeps, ...overrides };
  return {
    id: "rebelliard.worktree-setup",
    async setup(ctx: Context) {
      const events = ctx.event;
      if (!hasSubscribe(events)) {
        return;
      }
      const controller = new AbortController();
      void watch(deps, ctx, events, controller.signal);
      return () => {
        controller.abort();
      };
    },
  };
}

export default createWorktreeSetup();

function hasSubscribe(events: Context["event"]): events is {
  subscribe(options: { signal: AbortSignal }): AsyncIterable<unknown>;
} {
  return typeof events?.subscribe === "function";
}

async function watch(
  deps: Deps,
  ctx: Context,
  events: {
    subscribe(options: { signal: AbortSignal }): AsyncIterable<unknown>;
  },
  signal: AbortSignal,
): Promise<void> {
  try {
    for await (const event of events.subscribe({ signal })) {
      const ready = readReady(event);
      if (!ready) {
        continue;
      }
      try {
        await setupWorktree(deps, ctx, ready, signal);
      } catch (error) {
        if (signal.aborted) {
          return;
        }
        deps.log("worktree-setup: setup failed", error);
      }
    }
  } catch (error) {
    if (signal.aborted) {
      return;
    }
    deps.log("worktree-setup: event subscription failed", error);
  }
}

async function setupWorktree(
  deps: Deps,
  ctx: Context,
  ready: ReadyWorktree,
  signal: AbortSignal,
): Promise<void> {
  const projectID = ctx.location.project.id;
  if (ready.projectID && projectID && ready.projectID !== projectID) {
    return;
  }
  const source = ctx.location.project.canonical ?? ctx.location.directory;
  const directory = ready.directory ?? (await findWorktree(source, ready));
  if (!directory || (await samePath(directory, source))) {
    return;
  }
  const script = await resolveScript(ctx, directory, source);
  if (!script) {
    return;
  }

  const lockDir = lockPath(deps.lockRoot, directory);
  try {
    await mkdir(lockDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      return;
    }
    throw error;
  }

  try {
    await runSetup(directory, source, script, signal);
  } catch (error) {
    if (!signal.aborted) {
      deps.log("worktree-setup: setup failed", error);
    }
  } finally {
    await rm(lockDir, { recursive: true, force: true });
  }
}

async function resolveScript(
  ctx: Context,
  directory: string,
  source: string,
): Promise<string | undefined> {
  const fromOptions = scriptFromConfig(ctx.options);
  if (fromOptions) {
    return fromOptions;
  }
  const fromWorktree = await scriptFromDirectory(directory);
  if (fromWorktree) {
    return fromWorktree;
  }
  return scriptFromDirectory(source);
}

function runSetup(
  directory: string,
  source: string,
  script: string,
  signal: AbortSignal,
): Promise<void> {
  const env = { ...process.env };
  for (const key of SOURCE_ENV) {
    env[key] = source;
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (settle: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      settle();
    };
    const child = spawn("bash", ["--", script], {
      cwd: directory,
      env,
      signal,
      stdio: "inherit",
    });
    child.on("error", (error) => {
      finish(() => reject(error));
    });
    child.on("close", (code) => {
      finish(() => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(`worktree setup exited ${code ?? "unknown"}`));
      });
    });
  });
}

async function findWorktree(
  cwd: string,
  ready: ReadyWorktree,
): Promise<string | undefined> {
  const { stdout } = await exec("git", ["worktree", "list", "--porcelain"], {
    cwd,
  });
  return matchWorktree(parseWorktrees(stdout), ready);
}

async function samePath(left: string, right: string): Promise<boolean> {
  const [a, b] = await Promise.all([gitTopLevel(left), gitTopLevel(right)]);
  return a === b;
}

async function gitTopLevel(directory: string): Promise<string> {
  try {
    const { stdout } = await exec("git", [
      "-C",
      directory,
      "rev-parse",
      "--show-toplevel",
    ]);
    return stdout.trim();
  } catch {
    return path.resolve(directory);
  }
}
