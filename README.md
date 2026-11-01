# multi-rs-desktop

Multi Desktop is a git dashboard and commit tool for [multi](https://github.com/montaguegabe/multi-rs) workspaces: a root repo whose `multi.json` lists nested sub-repos. It lists your projects with their aggregate status, branches and worktrees, shows a combined working-tree diff across every repo in a workspace, lets you stage lines or files and commit per repo (optionally with AI-generated messages), pushes all repos at once, and browses a cross-repo commit timeline.

This is the Tauri 2 + React implementation that replaces the Electron `multi-desktop` app. The Rust side links `multi-core` from the sibling `multi-rs` checkout directly; nothing is spawned.

## Layout

| Path | Purpose |
| --- | --- |
| `src-tauri/` | Rust host: Tauri commands over `multi-core` (project inspection), git writes (stage, commit, push, discard), native menus and context menus, `multi://` deep links, OpenAI commit messages |
| `src/` | React renderer (Vite, Tailwind 3, react-router) |
| `src/multi-react/` | The shared diff viewer library, vendored from the `multi-react` repo |
| `src/lib/bridge.ts` | The renderer's typed view of every Tauri command and host event |

## Development

Prerequisites: Rust (stable), Node 20+, pnpm, and the Tauri 2 system dependencies for your platform. The `multi-rs` repo must be checked out as a sibling directory (the multi workspace does this for you) because `src-tauri/Cargo.toml` depends on `../../multi-rs/crates/multi-core`.

```bash
pnpm install
pnpm tauri dev            # run the app with hot reload
pnpm typecheck            # tsc
cd src-tauri && cargo test && cargo clippy --all-targets
pnpm tauri build          # release bundles under src-tauri/target/release/bundle
```

On macOS, `scripts/install-local-app.sh` builds the app and copies it to `/Applications`, replacing a running copy.

## State and integration

- Project list: `~/.multi/projects.json` (`[{ "path": "..." }]`). Settings: `~/.multi/settings.json` (`{ "openAIApiKey": "..." }`). Both are shared with the Electron app and the `multi` CLI, and honour `MULTI_HOME`.
- `multi open PATH` opens `multi://open?path=<percent-encoded path>`; a directory opens as a project, a file opens its repository with that file first.
- "Open in Cursor" and "Open in GitHub Desktop" launch the `cursor` and `github` CLIs; "Sync All" can create a private GitHub repo through `gh` when a repo has no remote.
