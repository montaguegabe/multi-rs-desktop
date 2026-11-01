#!/usr/bin/env bash
# Build the macOS app bundle and install it to /Applications, replacing a
# running copy. Usage: scripts/install-local-app.sh [--debug]
set -euo pipefail

cd "$(dirname "$0")/.."

profile=release
args=(--bundles app)
if [[ "${1:-}" == "--debug" ]]; then
  profile=debug
  args+=(--debug)
fi

pnpm tauri build "${args[@]}"

app_name="Multi Desktop"
built="src-tauri/target/$profile/bundle/macos/$app_name.app"
target="/Applications/$app_name.app"

if [[ ! -d "$built" ]]; then
  echo "Build did not produce $built" >&2
  exit 1
fi

osascript -e "tell application \"$app_name\" to quit" >/dev/null 2>&1 || true
sleep 1
rm -rf "$target"
cp -R "$built" "$target"
echo "Installed $target"
