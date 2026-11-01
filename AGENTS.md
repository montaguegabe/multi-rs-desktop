# multi-rs-desktop

Tauri 2 + React desktop app for multi workspaces. Private remake of the Electron `multi-desktop` repo, which is reference only and must never be pushed to from here.

- `src-tauri/` is a thin command layer: project inspection comes from `multi_core::app_api` (path dependency on the sibling `multi-rs` checkout); git writes shell out to `git`. Do not add libgit2.
- Keep `~/.multi/projects.json` and `~/.multi/settings.json` formats compatible with the `multi` CLI and the Electron app.
- `src/multi-react/` is vendored from the public `multi-react` repo. Changes to the diff viewer go there; keep the `multi-react` import alias (`vite.config.ts`, `tsconfig.json`) so renderer code stays portable.
- Payload types in `src/lib/types.ts` mirror the Rust structs (camelCase); change both sides together.
- Before committing: `pnpm typecheck`, `pnpm build`, and in `src-tauri/`: `cargo fmt`, `cargo clippy --all-targets`, `cargo test`.
- Trunk-based: commit and push to `main`.
