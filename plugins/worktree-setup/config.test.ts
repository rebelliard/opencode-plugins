import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  matchWorktree,
  parseWorktrees,
  readReady,
  scriptFromConfig,
  scriptFromDirectory,
} from "./config.ts";

describe("scriptFromConfig", () => {
  it("reads a non-empty script", () => {
    expect(scriptFromConfig({ script: " scripts/worktree-setup.sh " })).toBe(
      "scripts/worktree-setup.sh",
    );
  });

  it("ignores a missing or blank script", () => {
    expect(scriptFromConfig({})).toBeUndefined();
    expect(scriptFromConfig({ script: "  " })).toBeUndefined();
    expect(scriptFromConfig(null)).toBeUndefined();
  });
});

describe("scriptFromDirectory", () => {
  it("reads .opencode/worktree-setup.json", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "worktree-setup-"));
    await mkdir(path.join(root, ".opencode"));
    await writeFile(
      path.join(root, ".opencode", "worktree-setup.json"),
      JSON.stringify({ script: "bin/setup.sh" }),
    );

    await expect(scriptFromDirectory(root)).resolves.toBe("bin/setup.sh");
  });

  it("rethrows read errors other than a missing file", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "worktree-setup-"));
    await mkdir(path.join(root, ".opencode", "worktree-setup.json"), {
      recursive: true,
    });

    await expect(scriptFromDirectory(root)).rejects.toThrow();
  });

  it("returns undefined when the file is absent", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "worktree-setup-"));
    await expect(scriptFromDirectory(root)).resolves.toBeUndefined();
  });
});

describe("scriptFromConfig shapes", () => {
  it("ignores arrays and non-string scripts", () => {
    expect(scriptFromConfig([])).toBeUndefined();
    expect(scriptFromConfig({ script: 3 })).toBeUndefined();
  });
});

describe("worktree matching", () => {
  const porcelain = [
    "worktree /repo",
    "HEAD abc",
    "branch refs/heads/main",
    "",
    "worktree /trees/task",
    "HEAD def",
    "branch refs/heads/opencode/task",
    "",
  ].join("\n");

  it("matches the branch from a ready event", () => {
    expect(
      matchWorktree(parseWorktrees(porcelain), {
        name: "task",
        branch: "opencode/task",
      }),
    ).toBe("/trees/task");
  });

  it("returns undefined when nothing matches", () => {
    const entries = parseWorktrees(porcelain);
    expect(
      matchWorktree(entries, { name: "x", branch: "nope" }),
    ).toBeUndefined();
    expect(matchWorktree(entries, { name: "nope" })).toBeUndefined();
  });

  it("matches a detached worktree by directory name", () => {
    expect(
      matchWorktree(parseWorktrees("worktree /trees/task\nHEAD def\n"), {
        name: "task",
      }),
    ).toBe("/trees/task");
  });
});

describe("readReady", () => {
  it("reads a flat worktree.ready event", () => {
    expect(
      readReady({
        type: "worktree.ready",
        properties: { name: "task", branch: "opencode/task" },
        directory: "/trees/task",
        project: "project-1",
      }),
    ).toEqual({
      name: "task",
      branch: "opencode/task",
      directory: "/trees/task",
      projectID: "project-1",
    });
  });

  it("reads an enveloped event and ignores other types", () => {
    expect(
      readReady({
        directory: "/trees/task",
        payload: { type: "worktree.ready", properties: { name: "task" } },
      }),
    ).toEqual({
      name: "task",
      branch: undefined,
      directory: "/trees/task",
      projectID: undefined,
    });
    expect(readReady({ type: "worktree.failed" })).toBeUndefined();
  });

  it("rejects non-objects and events without a name", () => {
    expect(readReady(undefined)).toBeUndefined();
    expect(readReady("worktree.ready")).toBeUndefined();
    expect(
      readReady({ type: "worktree.ready", properties: { name: "" } }),
    ).toBeUndefined();
    expect(
      readReady({ type: "worktree.ready", properties: {} }),
    ).toBeUndefined();
  });
});
