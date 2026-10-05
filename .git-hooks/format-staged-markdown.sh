#!/bin/bash
# format-staged-markdown.sh — Run prettier --write on staged .md/.mdx files.
#
# Called by lefthook with staged markdown paths as arguments:
#   bash .git-hooks/format-staged-markdown.sh path/to/a.md path/to/b.mdx ...
#
# Uses `bunx` for low overhead, falls back to `npx` if `bun` is missing.
# Options come from `.git-hooks/prettierrc.markdown.json` (Markdown only — Biome ignores *.md).

if [ $# -eq 0 ]; then
  exit 0
fi

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
PRETTIER_CONFIG="${REPO_ROOT}/.git-hooks/prettierrc.markdown.json"

if [ ! -f "$PRETTIER_CONFIG" ]; then
  echo "format-staged-markdown: missing ${PRETTIER_CONFIG}" >&2
  exit 1
fi

if command -v bunx >/dev/null 2>&1; then
  PRETTIER="bunx prettier@3"
else
  PRETTIER="npx --yes prettier@3"
fi

output=$($PRETTIER --config "$PRETTIER_CONFIG" --write "$@" 2>&1)
exit_code=$?

if [ $exit_code -ne 0 ]; then
  echo "$output"
  exit $exit_code
fi

echo "$output"
