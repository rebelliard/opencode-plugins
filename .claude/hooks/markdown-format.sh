#!/bin/bash
# Hook: Format edited Markdown files
# Reads JSON from stdin, extracts file path, runs prettier --write only for
# .md / .mdx. Errors are intentionally swallowed so a formatter failure can't
# block the edit.
#
# Stdin shapes:
# - Claude Code PostToolUse: { "tool_input": { "file_path": "..." } }
# - Cursor afterFileEdit / afterTabFileEdit: { "file_path": "<absolute path>" }
#
# Uses `bunx` for low overhead. If `bun` is missing, the hook is a silent no-op.
# Options: `.git-hooks/prettierrc.markdown.json` (Markdown only — Biome ignores *.md).

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.file_path // .tool_input.file_path // empty')

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

case "$FILE_PATH" in
  *.md|*.mdx)
    if command -v bunx >/dev/null 2>&1; then
      REPO_ROOT="$(git -C "$(dirname "$FILE_PATH")" rev-parse --show-toplevel 2>/dev/null || pwd)"
      PRETTIER_CONFIG="${REPO_ROOT}/.git-hooks/prettierrc.markdown.json"
      if [ -f "$PRETTIER_CONFIG" ]; then
        bunx prettier@3 --config "$PRETTIER_CONFIG" --write "$FILE_PATH" >/dev/null 2>&1
      fi
    fi
    ;;
esac

exit 0
