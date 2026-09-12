#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST_DIR="$ROOT_DIR/resources/platform-tools-mac"
DOWNLOAD_DIR="$(mktemp -d "${TMPDIR:-/tmp}/gps-adb-darwin.XXXXXXXX")"
trap 'rm -rf -- "$DOWNLOAD_DIR"' EXIT
ZIP_PATH="$DOWNLOAD_DIR/platform-tools.zip"
EXTRACT_DIR="$DOWNLOAD_DIR/extracted"

mkdir -p "$DEST_DIR"


curl -fsSL https://dl.google.com/android/repository/platform-tools-latest-darwin.zip -o "$ZIP_PATH"
unzip -q "$ZIP_PATH" -d "$EXTRACT_DIR"
cp "$EXTRACT_DIR/platform-tools/adb" "$DEST_DIR/adb"
chmod +x "$DEST_DIR/adb"

"$DEST_DIR/adb" version
