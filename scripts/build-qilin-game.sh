#!/usr/bin/env bash
# Build the game from source; never commit WASM, PCKs, tool downloads or caches.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"
cache="$root/generated-artifacts/qilin-tools"
mkdir -p "$cache" public/qilin-keeper/game
if command -v godot >/dev/null 2>&1; then
  godot_bin="$(command -v godot)"
else
  godot_bin="$cache/Godot_v4.4.1-stable_linux.x86_64"
  if [[ ! -x "$godot_bin" ]]; then
    curl --fail --location --retry 3 \
      https://github.com/godotengine/godot/releases/download/4.4.1-stable/Godot_v4.4.1-stable_linux.x86_64.zip \
      --output "$cache/godot.zip"
    python3 -m zipfile -e "$cache/godot.zip" "$cache"
    chmod +x "$godot_bin"
  fi
fi
if [[ -f "$HOME/.local/share/godot/export_templates/4.4.1.stable/web_nothreads_release.zip" ]]; then
  export XDG_DATA_HOME="$HOME/.local/share"
else
  if [[ ! -f generated-artifacts/godot-tool-cache/godot/export_templates/4.4.1.stable/web_nothreads_release.zip ]]; then
    python3 scripts/fetch-qilin-web-templates.py
  fi
  export XDG_DATA_HOME="$root/generated-artifacts/godot-tool-cache"
fi
project="$root/games/qilin-keeper/godot"
"$godot_bin" --headless --path "$project" --editor --import --quit </dev/null 2>&1 | tee "$cache/import.log"
if grep -E 'SCRIPT ERROR|Parse Error' "$cache/import.log"; then exit 1; fi
# Export only checks compilation. Run the real behavioral suite before releasing.
# Godot can report script/assertion failures while still returning exit code zero.
timeout --kill-after=5s 90s "$godot_bin" --headless --path "$project" \
  --script res://tests/cassette_checks.gd </dev/null 2>&1 | tee "$cache/cassette.log"
if grep -Ei 'SCRIPT ERROR|Parse Error|Assertion failed|AssertionError|FAIL:' "$cache/cassette.log"; then
  exit 1
fi
if ! grep -Fxq 'Qilin cassette checks: PASS' "$cache/cassette.log"; then
  echo "Cassette checks did not finish successfully." >&2
  exit 1
fi
"$godot_bin" --headless --path "$project" --export-release Web "$root/public/qilin-keeper/game/index.html" --quit </dev/null 2>&1 | tee "$cache/export.log"
if grep -E 'SCRIPT ERROR|Parse Error' "$cache/export.log"; then exit 1; fi
cp "$project/assets/cover.jpg" public/qilin-keeper/game/cover.jpg
mkdir -p public/qilin-keeper/downloads
python3 scripts/package-qilin-source.py "$project" public/qilin-keeper/downloads/Qilin-Keeper-Godot.zip
