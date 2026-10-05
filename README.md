# opencode-plugins

Plugins for [OpenCode](https://opencode.ai) V2.

| Plugin                                     | What it does                                                          |
| ------------------------------------------ | --------------------------------------------------------------------- |
| [`output-style`](plugins/output-style)     | Makes agent messages shorter, and never shortens questions or errors. |
| [`worktree-setup`](plugins/worktree-setup) | Runs a repository's setup script after OpenCode creates a worktree.   |

## Use a plugin

Each plugin loads straight from GitHub. Pin a tag:

```jsonc
{
  "plugins": [
    "github:rebelliard/opencode-plugins#v0.1.0::path:plugins/output-style",
    "github:rebelliard/opencode-plugins#v0.1.0::path:plugins/worktree-setup",
  ],
}
```

Each plugin README lists its options.

## Develop

```bash
pnpm install
pnpm hook:install   # optional: format on commit
pnpm check          # format, types, tests with coverage thresholds
```

Layout: `plugins/<name>/{index.ts,package.json,README.md}`. Every plugin needs a `package.json` with `"opencode": { "plugin": "./index.ts" }` so OpenCode can load it from GitHub.

## License

MIT
