# macOS installer (.pkg)

Produces `PNE-LC-AI-<version>.pkg` — a **user-home-domain, no-admin** installer
that:

- installs the extension to `~/Library/Application Support/PNE LC AI/extension`
- installs `lc-updater` (universal binary) next to it
- (postinstall) writes the native-messaging host manifest to
  `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.pneunited.lc_updater.json`
- opens the extension folder and shows the one-time **Load unpacked** steps

## Build

Requires macOS (for `pkgbuild`/`productbuild`).

```bash
# from the repo root
npm install
npm run build                 # -> dist/
bash updater/build.sh         # -> updater/bin/lc-updater-darwin (universal)

bash installers/mac/build-pkg.sh
# -> installers/mac/build/PNE-LC-AI-<version>.pkg
```

## Signing + notarization (recommended)

Unsigned, macOS Gatekeeper shows "unidentified developer" and the updater binary
may be blocked. With an Apple Developer ID:

```bash
# 1. Sign the updater binary before building the pkg
codesign --force --options runtime --timestamp \
  --sign "Developer ID Application: <You> (<TEAMID>)" \
  updater/bin/lc-updater-darwin

# 2. Build, then sign the pkg
productsign --sign "Developer ID Installer: <You> (<TEAMID>)" \
  installers/mac/build/PNE-LC-AI-<version>.pkg \
  installers/mac/build/PNE-LC-AI-<version>-signed.pkg

# 3. Notarize + staple
xcrun notarytool submit installers/mac/build/PNE-LC-AI-<version>-signed.pkg \
  --apple-id <you@example.com> --team-id <TEAMID> --password <app-specific-pw> --wait
xcrun stapler staple installers/mac/build/PNE-LC-AI-<version>-signed.pkg
```

Without notarization, tell users to right-click the `.pkg` → **Open** the first
time. The postinstall script also clears the quarantine flag on the installed
files so the updater runs.

## Other Chromium browsers

The host manifest is written only to Chrome's `NativeMessagingHosts` directory.
For Chrome Beta/Canary, Chromium, Edge, or Brave, copy the same JSON to that
browser's `NativeMessagingHosts` folder (paths differ per browser). Chrome is
the supported target for v1.
