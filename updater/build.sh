#!/usr/bin/env bash
# Cross-compile the lc-updater native host for Windows and macOS.
# Output goes to updater/bin/ (git-ignored). Requires Go; `lipo` (macOS) is used
# to produce a universal mac binary when available.
set -euo pipefail
cd "$(dirname "$0")"

mkdir -p bin
LDFLAGS="-s -w"

echo "Building Windows (amd64)..."
GOOS=windows GOARCH=amd64 go build -ldflags "$LDFLAGS" -o bin/lc-updater.exe .

echo "Building macOS (amd64 + arm64)..."
GOOS=darwin GOARCH=amd64 go build -ldflags "$LDFLAGS" -o bin/lc-updater-darwin-amd64 .
GOOS=darwin GOARCH=arm64 go build -ldflags "$LDFLAGS" -o bin/lc-updater-darwin-arm64 .

if command -v lipo >/dev/null 2>&1; then
  lipo -create -output bin/lc-updater-darwin \
    bin/lc-updater-darwin-amd64 bin/lc-updater-darwin-arm64
  echo "✓ bin/lc-updater-darwin (universal)"
else
  echo "! lipo not found — ship bin/lc-updater-darwin-{amd64,arm64} separately"
fi

echo "✓ bin/lc-updater.exe"
echo "Done."
