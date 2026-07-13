#!/bin/bash
# =====================================================================
#  PNE LC AI (Gemini Connector) — macOS installer
#  Force-installs the extension into Chrome for the current user.
#  Usage: double-click this file, or run:  bash install-mac.command
#  (You may first need: chmod +x install-mac.command)
# =====================================================================
set -e

EXT_ID="epcnjdecfbmgbbcpebihlfiklanlijeb"
UPDATE_URL="https://ai.lcportal.cloud/ext/update.xml"

echo "Installing PNE LC AI (Gemini Connector) into Chrome..."

# Chrome de-duplicates the force list by extension ID, so -array-add is safe to re-run.
defaults write com.google.Chrome ExtensionInstallForcelist -array-add "${EXT_ID};${UPDATE_URL}"

echo ""
echo "DONE. Fully quit Chrome (Cmd+Q) and reopen it."
echo "The extension will auto-install within a minute of restart."
