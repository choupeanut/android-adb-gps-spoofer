#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST_DIR="$ROOT_DIR/resources/platform-tools-mac"
ZIP_PATH="${TMPDIR:-/tmp}/platform-tools-darwin.zip"
EXTRACT_DIR="${TMPDIR:-/tmp}/platform-tools-darwin"

mkdir -p "$DEST_DIR"
rm -rf "$EXTRACT_DIR"

curl -fsSL https://dl.google.com/android/repository/platform-tools-latest-darwin.zip -o "$ZIP_PATH"
unzip -q "$ZIP_PATH" -d "$EXTRACT_DIR"
cp "$EXTRACT_DIR/platform-tools/adb" "$DEST_DIR/adb"
chmod +x "$DEST_DIR/adb"

"$DEST_DIR/adb" version
