# Markdown formatting (Prettier only)

Biome is the repo-wide formatter for TypeScript, JavaScript, JSON, and other
non-Markdown files (`biome.json` excludes `**/*.md`). **Do not add a root
`.prettierrc`** — Prettier is scoped to Markdown only.

Markdown and MDX use **Prettier 3** with a dedicated config file:

| File                                                                               | Purpose                                                                                                |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| [`.git-hooks/prettierrc.markdown.json`](../../.git-hooks/prettierrc.markdown.json) | Options for `*.md` / `*.mdx` only (single quotes in fenced code, print width 100, preserve prose wrap) |

## When it runs

- **Pre-commit (Lefthook):** `format-markdown` → [`.git-hooks/format-staged-markdown.sh`](../../.git-hooks/format-staged-markdown.sh) passes `--config .git-hooks/prettierrc.markdown.json`.
- **Editor hooks:** [`.claude/hooks/markdown-format.sh`](../../.claude/hooks/markdown-format.sh) and [`.cursor/hooks.json`](../../.cursor/hooks.json) use the same config path.

## Manual / agent commands

For touched Markdown only:

```bash
pnpm exec prettier --config .git-hooks/prettierrc.markdown.json --write path/to/file.md
```

Or with `bunx`:

```bash
bunx prettier@3 --config .git-hooks/prettierrc.markdown.json --write path/to/file.md
```

Run Biome on code paths (`pnpm exec biome check --write …`); run Prettier with
this config on any `*.md` / `*.mdx` you edit. Biome will not format those
files.

## Quote style in docs

- **Fenced TypeScript/JavaScript** in Markdown → single-quoted strings
  (`'free-text'`), aligned with Biome `javascript.formatter.quoteStyle`.
- **Plain English quotes** in prose may stay as typed; Prettier does not
  rewrite `"not migrated yet"` style emphasis to single quotes.
