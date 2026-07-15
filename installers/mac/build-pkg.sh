#!/usr/bin/env bash
# Build the macOS installer package (user-home domain, no admin required).
#
# Prereqs (run from repo root first):
#   npm install && npm run build      -> dist/
#   updater/build.sh                  -> updater/bin/lc-updater-darwin (universal)
#
# Output: installers/mac/build/PNE-LC-AI-<version>.pkg
set -euo pipefail
cd "$(dirname "$0")"
HERE="$(pwd)"
ROOT="$(cd ../.. && pwd)"

VERSION="$(node -p "require('$ROOT/public/manifest.json').version")"

BIN="$ROOT/updater/bin/lc-updater-darwin"
if [ ! -f "$BIN" ]; then
  # Fall back to arch-specific binary if the universal one wasn't built.
  BIN="$ROOT/updater/bin/lc-updater-darwin-arm64"
fi
[ -f "$BIN" ] || { echo "✗ updater binary not found — run updater/build.sh first"; exit 1; }
[ -d "$ROOT/dist" ] || { echo "✗ dist/ not found — run 'npm run build' first"; exit 1; }

BUILD="$HERE/build"
PAYLOAD="$BUILD/payload"
rm -rf "$BUILD"
mkdir -p "$PAYLOAD/extension"

COPYFILE_DISABLE=1 cp -R "$ROOT/dist/." "$PAYLOAD/extension/"
cp "$BIN" "$PAYLOAD/lc-updater"
chmod +x "$PAYLOAD/lc-updater"

# Strip extended attributes so no AppleDouble (._*) metadata leaks into the payload.
xattr -cr "$PAYLOAD" 2>/dev/null || true

mkdir -p "$BUILD/scripts"
cp scripts/postinstall "$BUILD/scripts/postinstall"
chmod +x "$BUILD/scripts/postinstall"

echo "Building component package (v$VERSION)..."
pkgbuild \
  --root "$PAYLOAD" \
  --identifier com.pneunited.lcai \
  --version "$VERSION" \
  --scripts "$BUILD/scripts" \
  --install-location "Library/Application Support/PNE LC AI" \
  "$BUILD/component.pkg"

echo "Building product archive..."
productbuild \
  --distribution distribution.xml \
  --resources "$HERE" \
  --package-path "$BUILD" \
  "$BUILD/PNE-LC-AI-$VERSION.pkg"

rm -f "$BUILD/component.pkg"
echo "✓ $BUILD/PNE-LC-AI-$VERSION.pkg"
echo "  (unsigned — for a warning-free install, sign + notarize; see README.md)"
