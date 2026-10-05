# Coding Instructions

This repository holds OpenCode V2 plugins.

## Package Manager

Use `pnpm` for all commands.

## Project Shape

- `plugins/<name>/` — one plugin: `index.ts`, `package.json`, `README.md`, tests
- `.git-hooks/` — Lefthook scripts
- `.claude/hooks/`, `.cursor/hooks.json` — editor hooks that format edited files

A plugin default-exports an object with an `id` and `setup(ctx)`. Take side effects (files, logging) through an injected `deps` argument, so tests do not touch real state.

## Validation

```bash
pnpm check
```

`pnpm check` runs the format check, `tsc --noEmit`, and the tests with coverage thresholds (see `vitest.config.ts`). Keep coverage above the thresholds. Do not lower them to pass.

### Formatting

- Rewrite TypeScript and JSON formatting with `pnpm exec biome check --write <path>`.
- Biome ignores Markdown. Use Prettier with `.git-hooks/prettierrc.markdown.json` only. See `.agents/docs/markdown-formatting.md`. Do not add a repo-wide `.prettierrc`.
