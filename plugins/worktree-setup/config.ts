import { readFile } from "node:fs/promises";
import path from "node:path";

export interface ReadyWorktree {
  name: string;
  branch?: string;
  directory?: string;
  projectID?: string;
}

export interface WorktreeEntry {
  path: string;
  branch?: string;
}

const CONFIG_FILE = path.join(".opencode", "worktree-setup.json");

export function scriptFromConfig(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const script = (value as { script?: unknown }).script;
  if (typeof script !== "string") {
    return undefined;
  }
  const trimmed = script.trim();
  return trimmed === "" ? undefined : trimmed;
}

export async function scriptFromDirectory(
  directory: string,
): Promise<string | undefined> {
  let text: string;
  try {
    text = await readFile(path.join(directory, CONFIG_FILE), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
  return scriptFromConfig(JSON.parse(text) as unknown);
}

export function parseWorktrees(porcelain: string): WorktreeEntry[] {
  const entries: WorktreeEntry[] = [];
  let current: WorktreeEntry | undefined;
  for (const line of porcelain.split("\n")) {
    if (line.startsWith("worktree ")) {
      current = { path: line.slice("worktree ".length) };
      entries.push(current);
      continue;
    }
    if (current && line.startsWith("branch ")) {
      current.branch = line.slice("branch ".length);
    }
  }
  return entries;
}

export function matchWorktree(
  entries: readonly WorktreeEntry[],
  ready: ReadyWorktree,
): string | undefined {
  const wantedBranch = ready.branch ? `refs/heads/${ready.branch}` : undefined;
  for (const entry of entries) {
    if (wantedBranch && entry.branch === wantedBranch) {
      return entry.path;
    }
    if (!wantedBranch && path.basename(entry.path) === ready.name) {
      return entry.path;
    }
  }
  return undefined;
}

export function readReady(event: unknown): ReadyWorktree | undefined {
  if (!event || typeof event !== "object") {
    return undefined;
  }
  const record = event as Record<string, unknown>;
  const payload =
    record.payload && typeof record.payload === "object"
      ? (record.payload as Record<string, unknown>)
      : record;
  if (payload.type !== "worktree.ready") {
    return undefined;
  }
  const properties =
    payload.properties && typeof payload.properties === "object"
      ? (payload.properties as Record<string, unknown>)
      : payload;
  if (typeof properties.name !== "string" || properties.name === "") {
    return undefined;
  }
  return {
    name: properties.name,
    branch:
      typeof properties.branch === "string" ? properties.branch : undefined,
    directory:
      typeof record.directory === "string" ? record.directory : undefined,
    projectID: typeof record.project === "string" ? record.project : undefined,
  };
}
