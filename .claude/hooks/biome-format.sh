#!/bin/bash
# Hook: Format edited files with Biome
# Reads JSON from stdin, extracts file path, runs biome check --write
#
# Stdin shapes:
# - Claude Code PostToolUse: { "tool_input": { "file_path": "..." } }
# - Cursor afterFileEdit / afterTabFileEdit: { "file_path": "<absolute path>" }

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.file_path // .tool_input.file_path // empty')

if [ -n "$FILE_PATH" ]; then
  npx @biomejs/biome check --write "$FILE_PATH" >/dev/null 2>&1
fi

exit 0
