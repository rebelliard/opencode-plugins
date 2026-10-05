# Output style

OpenCode plugin that makes the agent's messages shorter. The default style is `concise`. It adds one block of instructions to the system prompt of the agent loop. It does not change what the agent does, only what it writes.

## What `concise` never shortens

These rules come first in the style text and win over the shortening rules:

- Questions to the user keep their full context: what was found, the options, and what each option implies.
- Answers to a user question, or a request for more detail, stay in full.
- Errors, failing test output, and their causes stay in full.
- Security warnings stay in full.
- Destructive actions name exactly what changes and ask first.
- Evidence, caveats, what was not verified, file paths, and links stay.

## What it shortens

- Lead-ins before the answer.
- Narration between tool calls (one short clause at most).
- Closing recaps of what the diff or the tool output already shows.

This is an instruction the model follows. Nothing enforces it.

## Load the plugin

Add it to `plugins` in `opencode.json(c)`:

```jsonc
{
  "plugins": ["github:rebelliard/opencode-plugins#v0.1.0::path:plugins/output-style"],
}
```

This plugin targets OpenCode V2 only.

## Options

```jsonc
{
  "plugins": [
    {
      "package": "github:rebelliard/opencode-plugins#v0.1.0::path:plugins/output-style",
      "options": {
        "style": "concise",
        "excludeAgents": ["plan", "prosecutor*"],
        "styles": {
          "terse": "Answer in as few words as possible.",
          "mine": { "file": ".opencode/styles/mine.md" },
        },
      },
    },
  ],
}
```

| Option          | Default     | Meaning                                                                                                        |
| --------------- | ----------- | -------------------------------------------------------------------------------------------------------------- |
| `style`         | `"concise"` | Style to apply. Built-ins are `concise` and `default` (adds nothing).                                          |
| `excludeAgents` | `["plan"]`  | Agents that never get a style. An entry ending in `*` is a prefix match. Setting it replaces the default list. |
| `styles`        | none        | Custom styles: inline text, or `{ "file": "<path>" }` relative to the project directory.                       |

An unknown `style` logs a warning and uses `concise`. A custom style with the same name as a built-in replaces it.

## Command

`/output-style` lists the styles and marks the active one. `/output-style <name>` sets the style for the current session. It applies from the next message. The reply does not start a model turn.

## Scope

The plugin registers only the `context` hook. Title, compaction, and `generate` requests are unchanged.
