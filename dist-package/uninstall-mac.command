#!/bin/bash
# =====================================================================
#  PNE LC AI (Gemini Connector) — macOS uninstaller
#  Removes the Chrome force-install policy for the current user.
#  Usage: double-click, or run:  bash uninstall-mac.command
# =====================================================================
set -e

echo "Removing PNE LC AI (Gemini Connector) force-install policy..."

# Removes the forced-extension list (this extension is the only entry in the
# team setup). If you force-install other extensions, edit this instead.
defaults delete com.google.Chrome ExtensionInstallForcelist 2>/dev/null || true

echo "DONE. Restart Chrome (Cmd+Q, reopen) to complete removal."
