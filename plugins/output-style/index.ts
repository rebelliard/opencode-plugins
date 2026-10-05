import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  type CustomStyleSource,
  isExcluded,
  parseOptions,
  resolveStyle,
  styleNames,
} from "./resolve.ts";

/** The slice of the OpenCode plugin context this plugin uses. */
export interface Context {
  location: { directory: string };
  options?: unknown;
  storage: {
    get(key: string): Promise<unknown>;
    set(key: string, value: string): Promise<unknown>;
  };
  session: {
    hook(
      name: "context",
      callback: (event: ContextEvent) => void | Promise<void>,
    ): Promise<unknown>;
    synthetic(input: {
      sessionID: string;
      text: string;
      resume: boolean;
    }): Promise<unknown>;
  };
  command: {
    transform(
      callback: (editor: {
        add(definition: {
          name: string;
          description?: string;
          execute(input: {
            sessionID: string;
            prompt: { text: string };
          }): Promise<void>;
        }): void;
      }) => void,
    ): Promise<unknown>;
  };
}

export interface ContextEvent {
  readonly sessionID: string;
  readonly agent: string;
  system: Array<{ type: "text"; text: string }>;
}

export interface Deps {
  readFile(file: string): Promise<string>;
  log(message: string, detail?: unknown): void;
}

const defaultDeps: Deps = {
  readFile: (file) => readFile(file, "utf8"),
  log: (message, detail) => {
    console.error(message, detail ?? "");
  },
};

const sessionKey = (sessionID: string) => `style/${sessionID}`;

async function loadCustomStyles(
  deps: Deps,
  directory: string,
  sources: Readonly<Record<string, CustomStyleSource>>,
): Promise<Map<string, string>> {
  const loaded = new Map<string, string>();
  for (const [name, source] of Object.entries(sources)) {
    if (typeof source === "string") {
      loaded.set(name, source);
      continue;
    }
    const file = path.resolve(directory, source.file);
    try {
      loaded.set(name, await deps.readFile(file));
    } catch (error) {
      deps.log(`output-style: cannot read style "${name}" from ${file}`, error);
    }
  }
  return loaded;
}

/**
 * Appends an output style to the system prompt of the agent loop. The default
 * style is `concise`. Pick another with the `style` option or `/output-style`.
 *
 * Only the `context` hook is registered, so title, compaction, and
 * `generate` requests stay untouched.
 */
export function createOutputStyle(overrides: Partial<Deps> = {}) {
  const deps: Deps = { ...defaultDeps, ...overrides };
  return {
    id: "rebelliard.output-style",
    async setup(ctx: Context) {
      const options = parseOptions(ctx.options);
      const custom = await loadCustomStyles(
        deps,
        ctx.location.directory,
        options.styles,
      );

      const configured = resolveStyle(options.style, custom);
      if (configured.fellBack) {
        deps.log(
          `output-style: unknown style "${options.style}", using "${configured.name}". Known: ${styleNames(custom).join(", ")}`,
        );
      }

      await ctx.session.hook("context", async (event) => {
        if (isExcluded(event.agent, options.excludeAgents)) {
          return;
        }
        const stored = await ctx.storage.get(sessionKey(event.sessionID));
        const resolved =
          typeof stored === "string"
            ? resolveStyle(stored, custom)
            : configured;
        if (resolved.text) {
          event.system.push({ type: "text", text: resolved.text });
        }
      });

      await ctx.command.transform((editor) => {
        editor.add({
          name: "output-style",
          description: "Show or set the output style for this session",
          async execute({ sessionID, prompt }) {
            const requested = prompt.text.trim();
            const stored = await ctx.storage.get(sessionKey(sessionID));
            const active = resolveStyle(
              typeof stored === "string" ? stored : options.style,
              custom,
            );
            const names = styleNames(custom);
            const list = names
              .map((name) => `${name === active.name ? "*" : "-"} ${name}`)
              .join("\n");

            let text: string;
            if (requested === "") {
              text = `Output style: ${active.name}\n\n${list}\n\nSet one with /output-style <name>.`;
            } else if (!names.includes(requested)) {
              text = `Unknown output style "${requested}". Available:\n${list}`;
            } else {
              await ctx.storage.set(sessionKey(sessionID), requested);
              text = `Output style set to ${requested} for this session. It applies from the next message.`;
            }
            await ctx.session.synthetic({ sessionID, text, resume: false });
          },
        });
      });
    },
  };
}

export default createOutputStyle();
