import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import worktreeSetup, { createWorktreeSetup, lockPath } from "./index.ts";

interface Events {
  subscribe(options: { signal: AbortSignal }): AsyncIterable<unknown>;
  push(event: unknown): void;
  signal(): AbortSignal | undefined;
}

/** A controllable event stream that ends when the plugin aborts it. */
function createEvents(): Events {
  const queue: unknown[] = [];
  let wake: (() => void) | undefined;
  let captured: AbortSignal | undefined;
  return {
    signal: () => captured,
    push(event) {
      queue.push(event);
      wake?.();
    },
    subscribe({ signal }) {
      captured = signal;
      return {
        async *[Symbol.asyncIterator]() {
          signal.addEventListener("abort", () => wake?.());
          while (!signal.aborted) {
            if (queue.length === 0) {
              await new Promise<void>((resolve) => {
                wake = resolve;
              });
              continue;
            }
            yield queue.shift();
          }
        },
      };
    },
  };
}

async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeoutMs = 10_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("waitFor timed out");
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 300));

function git(cwd: string, ...args: string[]): void {
  execFileSync(
    "git",
    [
      "-c",
      "user.email=test@example.com",
      "-c",
      "user.name=Test",
      "-c",
      "commit.gpgsign=false",
      ...args,
    ],
    { cwd, stdio: "ignore" },
  );
}

interface Fixture {
  root: string;
  main: string;
  worktree: string;
  lockRoot: string;
  marker: string;
  logs: Array<{ message: string; error: unknown }>;
  log(message: string, error: unknown): void;
  markerScript(): Promise<string>;
}

let fx: Fixture;

beforeEach(async () => {
  const root = await realpath(
    await mkdtemp(path.join(tmpdir(), "worktree-setup-test-")),
  );
  const main = path.join(root, "main");
  const worktree = path.join(root, "task");
  const lockRoot = path.join(root, "locks");
  await mkdir(main);
  await mkdir(lockRoot);
  git(main, "init", "-q", "-b", "main");
  await writeFile(path.join(main, "README.md"), "hi\n");
  git(main, "add", ".");
  git(main, "commit", "-q", "-m", "init");
  git(main, "worktree", "add", "-q", "-b", "opencode/task", worktree);

  const marker = path.join(root, "marker.txt");
  const logs: Fixture["logs"] = [];
  fx = {
    root,
    main,
    worktree,
    lockRoot,
    marker,
    logs,
    log: (message, error) => {
      logs.push({ message, error });
    },
    async markerScript() {
      const script = path.join(root, "setup.sh");
      await writeFile(
        script,
        [
          "#!/bin/bash",
          `printf '%s\\n' "$(pwd -P)" "$WORKTREE_SETUP_SOURCE_WORKTREE" "$MAIN_WORKTREE" "$ROOT_WORKTREE_PATH" > "${marker}"`,
          "",
        ].join("\n"),
      );
      return script;
    },
  };
});

afterEach(async () => {
  await rm(fx.root, { recursive: true, force: true });
});

function start(
  options: unknown,
  events: Events,
  extra: { projectID?: string } = {},
) {
  const plugin = createWorktreeSetup({ lockRoot: fx.lockRoot, log: fx.log });
  return plugin.setup({
    location: {
      directory: fx.main,
      project: { id: extra.projectID, canonical: fx.main },
    },
    options,
    event: events,
  });
}

const ready = (extra: Record<string, unknown> = {}) => ({
  type: "worktree.ready",
  properties: { name: "task", branch: "opencode/task" },
  directory: fx.worktree,
  ...extra,
});

describe("default export", () => {
  it("is the rebelliard.worktree-setup plugin", () => {
    expect(worktreeSetup.id).toBe("rebelliard.worktree-setup");
    expect(typeof worktreeSetup.setup).toBe("function");
  });

  it("logs to console.error by default", async () => {
    const original = console.error;
    const calls: unknown[][] = [];
    console.error = (...args: unknown[]) => {
      calls.push(args);
    };
    try {
      const events = createEvents();
      const cleanup = await worktreeSetup.setup({
        location: { directory: fx.main, project: { canonical: fx.main } },
        options: { script: "setup.sh" },
        event: events,
      });
      events.push(ready({ directory: path.join(fx.root, "missing") }));
      await waitFor(() => calls.length > 0);
      cleanup?.();
      expect(String(calls[0]?.[0])).toContain("worktree-setup:");
    } finally {
      console.error = original;
    }
  });
});

describe("setup", () => {
  it("does nothing when the event API is missing", async () => {
    const plugin = createWorktreeSetup({ lockRoot: fx.lockRoot });
    const location = { directory: fx.main, project: {} };
    await expect(plugin.setup({ location })).resolves.toBeUndefined();
    await expect(plugin.setup({ location, event: {} })).resolves.toBe(
      undefined,
    );
  });

  it("returns a cleanup that aborts the subscription", async () => {
    const events = createEvents();
    const cleanup = await start({}, events);
    await waitFor(() => events.signal() !== undefined);
    expect(events.signal()?.aborted).toBe(false);
    cleanup?.();
    expect(events.signal()?.aborted).toBe(true);
  });
});

describe("running the script", () => {
  it("runs the script in the worktree with the source exported", async () => {
    const script = await fx.markerScript();
    const events = createEvents();
    const cleanup = await start({ script }, events);

    events.push(ready());
    await waitFor(() => existsSync(fx.marker));
    cleanup?.();

    const [cwd, source, main, root] = (await readFile(fx.marker, "utf8"))
      .trim()
      .split("\n");
    expect(cwd).toBe(fx.worktree);
    expect(source).toBe(fx.main);
    expect(main).toBe(fx.main);
    expect(root).toBe(fx.main);
    expect(fx.logs).toEqual([]);
  });

  it("finds the worktree through git when the event has no directory", async () => {
    const script = await fx.markerScript();
    const events = createEvents();
    const cleanup = await start({ script }, events);

    events.push({
      type: "worktree.ready",
      properties: { name: "task", branch: "opencode/task" },
    });
    await waitFor(() => existsSync(fx.marker));
    cleanup?.();

    expect((await readFile(fx.marker, "utf8")).split("\n")[0]).toBe(
      fx.worktree,
    );
  });

  it("does nothing when git does not know the worktree", async () => {
    const script = await fx.markerScript();
    const events = createEvents();
    const cleanup = await start({ script }, events);

    events.push({
      type: "worktree.ready",
      properties: { name: "ghost", branch: "opencode/ghost" },
    });
    await settle();
    cleanup?.();

    expect(existsSync(fx.marker)).toBe(false);
    expect(fx.logs).toEqual([]);
  });

  it("reads the script from the worktree's config file", async () => {
    const script = await fx.markerScript();
    await mkdir(path.join(fx.worktree, ".opencode"));
    await writeFile(
      path.join(fx.worktree, ".opencode", "worktree-setup.json"),
      JSON.stringify({ script }),
    );
    const events = createEvents();
    const cleanup = await start({}, events);

    events.push(ready());
    await waitFor(() => existsSync(fx.marker));
    cleanup?.();
  });

  it("falls back to the source checkout's config file", async () => {
    const script = await fx.markerScript();
    await mkdir(path.join(fx.main, ".opencode"));
    await writeFile(
      path.join(fx.main, ".opencode", "worktree-setup.json"),
      JSON.stringify({ script }),
    );
    const events = createEvents();
    const cleanup = await start(undefined, events);

    events.push(ready());
    await waitFor(() => existsSync(fx.marker));
    cleanup?.();
  });

  it("prefers the plugin option over config files", async () => {
    const optionScript = await fx.markerScript();
    const otherMarker = path.join(fx.root, "other.txt");
    const otherScript = path.join(fx.root, "other.sh");
    await writeFile(otherScript, `touch "${otherMarker}"\n`);
    await mkdir(path.join(fx.worktree, ".opencode"));
    await writeFile(
      path.join(fx.worktree, ".opencode", "worktree-setup.json"),
      JSON.stringify({ script: otherScript }),
    );
    const events = createEvents();
    const cleanup = await start({ script: optionScript }, events);

    events.push(ready());
    await waitFor(() => existsSync(fx.marker));
    cleanup?.();

    expect(existsSync(otherMarker)).toBe(false);
  });
});

describe("skipping", () => {
  it("ignores events that are not worktree.ready", async () => {
    const script = await fx.markerScript();
    const events = createEvents();
    const cleanup = await start({ script }, events);

    events.push({ type: "session.idle" });
    events.push("not an object");
    await settle();
    cleanup?.();

    expect(existsSync(fx.marker)).toBe(false);
  });

  it("skips a worktree that belongs to another project", async () => {
    const script = await fx.markerScript();
    const events = createEvents();
    const cleanup = await start({ script }, events, { projectID: "p1" });

    events.push(ready({ project: "p2" }));
    await settle();
    expect(existsSync(fx.marker)).toBe(false);

    events.push(ready({ project: "p1" }));
    await waitFor(() => existsSync(fx.marker));
    cleanup?.();
  });

  it("skips the canonical checkout itself", async () => {
    const script = await fx.markerScript();
    const events = createEvents();
    const cleanup = await start({ script }, events);

    events.push(ready({ directory: fx.main }));
    await settle();
    cleanup?.();

    expect(existsSync(fx.marker)).toBe(false);
  });

  it("skips when no script is configured anywhere", async () => {
    const events = createEvents();
    const cleanup = await start({}, events);

    events.push(ready());
    await settle();
    cleanup?.();

    expect(fx.logs).toEqual([]);
    expect(existsSync(fx.marker)).toBe(false);
  });

  it("falls back to the location directory when there is no canonical path", async () => {
    const script = await fx.markerScript();
    const events = createEvents();
    const plugin = createWorktreeSetup({ lockRoot: fx.lockRoot, log: fx.log });
    const cleanup = await plugin.setup({
      location: { directory: fx.main, project: {} },
      options: { script },
      event: events,
    });

    events.push(ready());
    await waitFor(() => existsSync(fx.marker));
    cleanup?.();
  });
});

describe("lock", () => {
  it("does not run twice while a setup is already in flight", async () => {
    const script = await fx.markerScript();
    await mkdir(lockPath(fx.lockRoot, fx.worktree));
    const events = createEvents();
    const cleanup = await start({ script }, events);

    events.push(ready());
    await settle();
    cleanup?.();

    expect(existsSync(fx.marker)).toBe(false);
    expect(fx.logs).toEqual([]);
  });

  it("releases the lock after a successful run", async () => {
    const script = await fx.markerScript();
    const events = createEvents();
    const cleanup = await start({ script }, events);

    events.push(ready());
    await waitFor(() => existsSync(fx.marker));
    await waitFor(() => !existsSync(lockPath(fx.lockRoot, fx.worktree)));
    cleanup?.();
  });

  it("releases the lock after a failed run", async () => {
    const script = path.join(fx.root, "fail.sh");
    await writeFile(script, "exit 3\n");
    const events = createEvents();
    const cleanup = await start({ script }, events);

    events.push(ready());
    await waitFor(() => fx.logs.length > 0);
    await waitFor(() => !existsSync(lockPath(fx.lockRoot, fx.worktree)));
    cleanup?.();
  });

  it("logs and keeps consuming when the lock cannot be created", async () => {
    const script = await fx.markerScript();
    const events = createEvents();
    const plugin = createWorktreeSetup({
      lockRoot: path.join(fx.root, "no", "such", "dir"),
      log: fx.log,
    });
    const cleanup = await plugin.setup({
      location: { directory: fx.main, project: { canonical: fx.main } },
      options: { script },
      event: events,
    });

    events.push(ready());
    await waitFor(() => fx.logs.length > 0);
    cleanup?.();

    expect(fx.logs[0]?.message).toBe("worktree-setup: setup failed");
    expect(existsSync(fx.marker)).toBe(false);
  });
});

describe("failures", () => {
  it("logs the exit code when the script fails", async () => {
    const script = path.join(fx.root, "fail.sh");
    await writeFile(script, "exit 7\n");
    const events = createEvents();
    const cleanup = await start({ script }, events);

    events.push(ready());
    await waitFor(() => fx.logs.length > 0);
    cleanup?.();

    expect(fx.logs[0]?.message).toBe("worktree-setup: setup failed");
    expect(String(fx.logs[0]?.error)).toContain("exited 7");
  });

  it("logs when the config file is not valid JSON", async () => {
    await mkdir(path.join(fx.worktree, ".opencode"));
    await writeFile(
      path.join(fx.worktree, ".opencode", "worktree-setup.json"),
      "{ nope",
    );
    const events = createEvents();
    const cleanup = await start({}, events);

    events.push(ready());
    await waitFor(() => fx.logs.length > 0);
    cleanup?.();

    expect(fx.logs[0]?.message).toBe("worktree-setup: setup failed");
    expect(fx.logs[0]?.error).toBeInstanceOf(SyntaxError);
  });

  it("logs when the script cannot be spawned", async () => {
    const events = createEvents();
    const cleanup = await start({ script: "setup.sh" }, events);

    events.push(ready({ directory: path.join(fx.root, "missing") }));
    await waitFor(() => fx.logs.length > 0);
    cleanup?.();

    expect(fx.logs[0]?.message).toBe("worktree-setup: setup failed");
  });

  it("keeps processing events after one setup fails", async () => {
    const bad = path.join(fx.root, "fail.sh");
    await writeFile(bad, "exit 1\n");
    const events = createEvents();
    const cleanup = await start({ script: bad }, events);

    events.push(ready());
    await waitFor(() => fx.logs.length === 1);
    await waitFor(() => !existsSync(lockPath(fx.lockRoot, fx.worktree)));
    events.push(ready());
    await waitFor(() => fx.logs.length === 2);
    cleanup?.();
  });

  it("logs when the event subscription throws", async () => {
    const plugin = createWorktreeSetup({ lockRoot: fx.lockRoot, log: fx.log });
    const boom = new Error("stream broke");
    const cleanup = await plugin.setup({
      location: { directory: fx.main, project: {} },
      event: {
        subscribe() {
          return {
            // biome-ignore lint/correctness/useYield: the stream throws before yielding.
            async *[Symbol.asyncIterator]() {
              throw boom;
            },
          };
        },
      },
    });
    await waitFor(() => fx.logs.length > 0);
    cleanup?.();

    expect(fx.logs[0]).toEqual({
      message: "worktree-setup: event subscription failed",
      error: boom,
    });
  });

  it("stays quiet when the subscription throws because of an abort", async () => {
    const plugin = createWorktreeSetup({ lockRoot: fx.lockRoot, log: fx.log });
    const cleanup = await plugin.setup({
      location: { directory: fx.main, project: {} },
      event: {
        subscribe({ signal }) {
          return {
            async *[Symbol.asyncIterator]() {
              await new Promise<void>((resolve) => {
                signal.addEventListener("abort", () => resolve());
              });
              throw new Error("aborted");
            },
          };
        },
      },
    });
    cleanup?.();
    await settle();

    expect(fx.logs).toEqual([]);
  });

  it("kills a running script and stays quiet when the plugin unloads", async () => {
    const started = path.join(fx.root, "started.txt");
    const script = path.join(fx.root, "slow.sh");
    await writeFile(script, `touch "${started}"\nexec sleep 30\n`);
    const events = createEvents();
    const cleanup = await start({ script }, events);

    events.push(ready());
    await waitFor(() => existsSync(started));
    cleanup?.();
    await waitFor(() => !existsSync(lockPath(fx.lockRoot, fx.worktree)));

    expect(fx.logs).toEqual([]);
  });
});
