import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Plugin } from "@opencode/plugin";
import { afterEach, describe, expect, it } from "vitest";
import outputStyle, {
  type Context,
  type ContextEvent,
  createOutputStyle,
} from "./index.ts";
import { BUILT_IN_STYLES } from "./styles.ts";

type Command = Parameters<
  Parameters<Context["command"]["transform"]>[0] extends (
    editor: infer E,
  ) => void
    ? E extends { add(definition: infer D): void }
      ? (definition: D) => void
      : never
    : never
>[0];

interface Fake {
  ctx: Context;
  hooks: string[];
  logs: Array<{ message: string; detail?: unknown }>;
  messages: Array<{ sessionID: string; text: string; resume: boolean }>;
  store: Map<string, unknown>;
  run(event: Partial<ContextEvent>): Promise<ContextEvent>;
  command(sessionID: string, text: string): Promise<void>;
}

const tmpDirs: string[] = [];
afterEach(async () => {
  await Promise.all(
    tmpDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

/** Builds a plugin context that records hooks, storage, and messages. */
function fakeContext(options?: unknown, directory = "/project"): Fake {
  const hooks: string[] = [];
  const store = new Map<string, unknown>();
  const messages: Fake["messages"] = [];
  let contextHook: ((event: ContextEvent) => void | Promise<void>) | undefined;
  let command: Command | undefined;

  const ctx: Context = {
    location: { directory },
    options,
    storage: {
      get: async (key) => store.get(key),
      set: async (key, value) => {
        store.set(key, value);
      },
    },
    session: {
      hook: async (name, callback) => {
        hooks.push(name);
        contextHook = callback;
        return { dispose: async () => {} };
      },
      synthetic: async (input) => {
        messages.push(input);
      },
    },
    command: {
      transform: async (callback) => {
        callback({
          add: (definition) => {
            command = definition as unknown as Command;
          },
        });
      },
    },
  };

  return {
    ctx,
    hooks,
    logs: [],
    messages,
    store,
    async run(event) {
      const full: ContextEvent = {
        sessionID: "ses_1",
        agent: "build",
        system: [{ type: "text", text: "base" }],
        ...event,
      };
      await contextHook?.(full);
      return full;
    },
    async command(sessionID, text) {
      const definition = command as unknown as {
        execute(input: {
          sessionID: string;
          prompt: { text: string };
        }): Promise<void>;
      };
      await definition.execute({ sessionID, prompt: { text } });
    },
  };
}

async function setup(options?: unknown, directory?: string) {
  const fake = fakeContext(options, directory);
  const logs: Fake["logs"] = fake.logs;
  const plugin = createOutputStyle({
    log: (message, detail) => {
      logs.push({ message, detail });
    },
    readFile: async (file) => {
      if (file.endsWith("missing.md")) {
        throw new Error("ENOENT");
      }
      return `file:${file}`;
    },
  });
  await plugin.setup(fake.ctx);
  return fake;
}

describe("plugin definition", () => {
  it("has a stable id", () => {
    expect(outputStyle.id).toBe("rebelliard.output-style");
  });

  it("is accepted as an OpenCode plugin (compile-time check)", () => {
    // Fails `tsc` if our Context stops matching the real plugin Context.
    const plugin: Plugin.Plugin = outputStyle;
    expect(plugin.id).toBe(outputStyle.id);
  });
});

describe("hook registration", () => {
  it("registers only the context hook", async () => {
    const fake = await setup();
    expect(fake.hooks).toEqual(["context"]);
  });
});

describe("context hook", () => {
  it("appends the concise style by default", async () => {
    const fake = await setup();
    const event = await fake.run({});
    expect(event.system).toEqual([
      { type: "text", text: "base" },
      { type: "text", text: BUILT_IN_STYLES.concise },
    ]);
  });

  it("appends nothing for the default style", async () => {
    const fake = await setup({ style: "default" });
    const event = await fake.run({});
    expect(event.system).toEqual([{ type: "text", text: "base" }]);
  });

  it("skips plan by default", async () => {
    const fake = await setup();
    const event = await fake.run({ agent: "plan" });
    expect(event.system).toHaveLength(1);
  });

  it("honors a custom exclude list", async () => {
    const fake = await setup({ excludeAgents: ["prosecutor*"] });
    expect((await fake.run({ agent: "prosecutor-diff" })).system).toHaveLength(
      1,
    );
    expect((await fake.run({ agent: "plan" })).system).toHaveLength(2);
  });

  it("uses a session override over the option", async () => {
    const fake = await setup({ style: "concise" });
    fake.store.set("style/ses_1", "default");
    expect((await fake.run({ sessionID: "ses_1" })).system).toHaveLength(1);
    expect((await fake.run({ sessionID: "ses_2" })).system).toHaveLength(2);
  });

  it("falls back to the configured style when the override is unknown", async () => {
    const fake = await setup();
    fake.store.set("style/ses_1", "gone");
    const event = await fake.run({});
    expect(event.system[1]?.text).toBe(BUILT_IN_STYLES.concise);
  });

  it("ignores a non-string stored value", async () => {
    const fake = await setup();
    fake.store.set("style/ses_1", 42);
    expect((await fake.run({})).system).toHaveLength(2);
  });

  it("applies inline custom styles", async () => {
    const fake = await setup({
      style: "terse",
      styles: { terse: "Be terse." },
    });
    expect((await fake.run({})).system[1]?.text).toBe("Be terse.");
  });
});

describe("custom style files", () => {
  it("reads a file relative to the project directory", async () => {
    const fake = await setup(
      { style: "loud", styles: { loud: { file: "styles/loud.md" } } },
      "/project",
    );
    expect((await fake.run({})).system[1]?.text).toBe(
      `file:${path.resolve("/project", "styles/loud.md")}`,
    );
  });

  it("logs once and falls back when a file is missing", async () => {
    const fake = await setup({
      style: "loud",
      styles: { loud: { file: "missing.md" } },
    });
    expect(fake.logs.map((entry) => entry.message)).toEqual([
      expect.stringContaining('cannot read style "loud"'),
      expect.stringContaining('unknown style "loud"'),
    ]);
    expect((await fake.run({})).system[1]?.text).toBe(BUILT_IN_STYLES.concise);
  });

  it("reads a real file with the default reader", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "output-style-"));
    tmpDirs.push(dir);
    await writeFile(path.join(dir, "mine.md"), "From disk.");
    const fake = fakeContext(
      { style: "mine", styles: { mine: { file: "mine.md" } } },
      dir,
    );
    await createOutputStyle().setup(fake.ctx);
    expect((await fake.run({})).system[1]?.text).toBe("From disk.");
  });

  it("logs to console.error by default", async () => {
    const original = console.error;
    const calls: unknown[][] = [];
    console.error = (...args: unknown[]) => {
      calls.push(args);
    };
    try {
      const fake = fakeContext({ style: "nope" });
      await createOutputStyle().setup(fake.ctx);
      expect(String(calls[0]?.[0])).toContain("unknown style");
    } finally {
      console.error = original;
    }
  });
});

describe("unknown configured style", () => {
  it("warns with the known names and uses concise", async () => {
    const fake = await setup({ style: "nope", styles: { terse: "x" } });
    expect(fake.logs).toHaveLength(1);
    expect(fake.logs[0]?.message).toContain("concise, default, terse");
    expect((await fake.run({})).system[1]?.text).toBe(BUILT_IN_STYLES.concise);
  });

  it("does not warn for a known style", async () => {
    const fake = await setup({ style: "default" });
    expect(fake.logs).toEqual([]);
  });
});

describe("/output-style", () => {
  it("lists styles and marks the active one without a model turn", async () => {
    const fake = await setup();
    await fake.command("ses_1", "");
    expect(fake.messages).toHaveLength(1);
    expect(fake.messages[0]?.resume).toBe(false);
    expect(fake.messages[0]?.sessionID).toBe("ses_1");
    expect(fake.messages[0]?.text).toContain("Output style: concise");
    expect(fake.messages[0]?.text).toContain("* concise");
    expect(fake.messages[0]?.text).toContain("- default");
  });

  it("stores a valid choice for the session only", async () => {
    const fake = await setup();
    await fake.command("ses_1", " default ");
    expect(fake.store.get("style/ses_1")).toBe("default");
    expect(fake.store.has("style/ses_2")).toBe(false);
    expect(fake.messages[0]?.text).toContain("set to default");
    expect((await fake.run({ sessionID: "ses_1" })).system).toHaveLength(1);
    expect((await fake.run({ sessionID: "ses_2" })).system).toHaveLength(2);
  });

  it("shows the session override when listing", async () => {
    const fake = await setup();
    await fake.command("ses_1", "default");
    await fake.command("ses_1", "");
    expect(fake.messages[1]?.text).toContain("Output style: default");
    expect(fake.messages[1]?.text).toContain("* default");
  });

  it("rejects an unknown name and writes nothing", async () => {
    const fake = await setup();
    await fake.command("ses_1", "nope");
    expect(fake.store.size).toBe(0);
    expect(fake.messages[0]?.text).toContain('Unknown output style "nope"');
    expect(fake.messages[0]?.text).toContain("- default");
  });

  it("accepts custom style names", async () => {
    const fake = await setup({ styles: { terse: "Be terse." } });
    await fake.command("ses_1", "terse");
    expect(fake.store.get("style/ses_1")).toBe("terse");
    expect((await fake.run({})).system[1]?.text).toBe("Be terse.");
  });
});
