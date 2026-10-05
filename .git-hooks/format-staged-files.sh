#!/bin/bash
# format-staged-files.sh — Run biome check --write on staged files.
#
# Called by lefthook with staged file paths as arguments:
#   bash .git-hooks/format-staged-files.sh path/to/a.ts path/to/b.json ...
#
# Prefers the local biome binary for speed, then bunx, then npx as fallbacks.
# Exits 0 when biome has no files to process (e.g. only .sh or .yml staged).

if [ $# -eq 0 ]; then
  exit 0
fi

if [ -x "./node_modules/.bin/biome" ]; then
  BIOME="./node_modules/.bin/biome"
elif command -v bunx >/dev/null 2>&1; then
  BIOME="bunx @biomejs/biome"
else
  BIOME="npx --yes @biomejs/biome"
fi

output=$($BIOME check --write "$@" 2>&1)
exit_code=$?

if [ $exit_code -ne 0 ]; then
  if echo "$output" | grep -q "No files were processed"; then
    exit 0
  fi
  echo "$output"
  exit $exit_code
fi

echo "$output"
