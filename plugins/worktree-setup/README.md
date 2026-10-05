# Worktree setup

OpenCode plugin that runs a repository's setup script after OpenCode creates a worktree. The plugin lives here. Each repository only names its script.

## Repository config

Add `.opencode/worktree-setup.json`:

```json
{
  "script": "scripts/worktree-setup.sh"
}
```

`script` is a path relative to the new worktree, or an absolute path. OpenCode runs it with `bash` after checkout. The canonical checkout path is exported as `WORKTREE_SETUP_SOURCE_WORKTREE`, `MAIN_WORKTREE`, and `ROOT_WORKTREE_PATH`.

A plugin `options.script` value overrides the file.

Repositories without this file are unchanged.

## Load the plugin

Add this entry to the OpenCode `plugin` array:

```text
github:rebelliard/opencode-plugins#v0.1.0::path:plugins/worktree-setup
```

OpenCode fetches the plugin from GitHub. No local checkout is required.
