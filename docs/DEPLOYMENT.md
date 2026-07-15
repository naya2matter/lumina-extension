# Deploying & updating PNE LC AI (self-hosted, no Chrome Web Store)

This extension is distributed **privately from our own server** — no Chrome Web
Store, no Google/enterprise enrollment. Because current Chrome blocks off-store
extensions on unmanaged machines, we ship it as an **unpacked extension loaded
once in Developer mode**, plus a tiny **per-user native updater** that keeps it
current from `https://ai.lcportal.cloud/ext/`.

- Users run a small installer (Windows `.exe` / macOS `.pkg`) — **no admin**.
- They do a one-time **Load unpacked** in `chrome://extensions`.
- After that, updates apply automatically in the background.

## How it fits together

```
public/manifest.json  ──(vite build)──►  dist/  ──(npm run release)──►  release/
   • "key" pins the extension ID: glanidmlbocpbpihkbahamdipkkiiacb                │
   • background.js checks for updates via the native host                        │
                                                                                 ▼
                                          release/pne-lc-ai-<version>.zip  +  latest.json
                                                                                 │  upload
                                                                                 ▼
                                          https://ai.lcportal.cloud/ext/  (static hosting)
                                                                                 ▲
        lc-updater (Go native host)  ── GET latest.json, download+verify+swap ───┘
              ▲ started by Chrome via native messaging (registered per-user)
              │
        Chrome service worker (alarm every 6h / on startup) → reload() after a swap
```

Key files:
- `updater/` — the Go native-messaging host (`lc-updater`). Cross-compiled by `updater/build.sh`.
- `installers/windows/` — Inno Setup installer.
- `installers/mac/` — `.pkg` builder.
- `scripts/gen-key.mjs` — one-time identity generation.
- `scripts/release.mjs` — `npm run release`.

## One-time setup

1. **Generate the stable identity** (already done — `key` is committed in
   `public/manifest.json`). Only re-run `npm run gen-key` if you deliberately
   want a **new** extension ID (this breaks every existing install). The private
   key lives in `keys/` (git-ignored).

2. **Set up static hosting** at `https://ai.lcportal.cloud/ext/` serving:
   - `latest.json` (small JSON)
   - `pne-lc-ai-<version>.zip` (each release)

   nginx example:
   ```nginx
   location /ext/ {
       alias /var/www/lcai-ext/;
       types { application/json json; application/zip zip; }
       add_header Cache-Control "no-cache";   # so updates are seen promptly
   }
   ```
   No CORS needed — the native host fetches server-side.

## Cutting a release

```bash
# 1. Bump the version (single source of truth)
#    edit public/manifest.json  ->  "version": "1.0.1"

# 2. Build + package
npm install          # first time only
npm run release      # builds dist/, writes release/pne-lc-ai-1.0.1.zip + latest.json

# 3. Upload BOTH files to the server
scp release/pne-lc-ai-1.0.1.zip release/latest.json  user@host:/var/www/lcai-ext/
```

`latest.json` looks like:
```json
{ "version": "1.0.1",
  "zip_url": "https://ai.lcportal.cloud/ext/pne-lc-ai-1.0.1.zip",
  "sha256": "…" }
```

Within ~6 hours (or on next Chrome startup) every installed extension checks
`latest.json`, and if newer, the native host downloads the zip, verifies the
SHA-256, swaps the files, and the extension reloads itself. Users can force it
from the popup ("check for updates").

> Keep old `pne-lc-ai-<version>.zip` files on the server until all clients have
> moved past them. Overwrite `latest.json` last.

## Building the installers

The updater binary must be built first (any OS):
```bash
bash updater/build.sh      # -> updater/bin/lc-updater.exe and lc-updater-darwin
npm run build              # -> dist/
```

- **Windows** (needs Inno Setup 6 on Windows/Wine): see `installers/windows/README.md`.
  Output: `PNE-LC-AI-Setup.exe`.
- **macOS** (needs `pkgbuild`/`productbuild`): `bash installers/mac/build-pkg.sh`.
  Output: `installers/mac/build/PNE-LC-AI-<version>.pkg`.

Distribute these installers to users however you like (download link, email, MDM,
USB). They are the only thing users run.

## What the user does (once)

1. Run the installer (no admin).
2. `chrome://extensions` → turn **Developer mode ON** (keep it on).
3. **Load unpacked** → pick the `extension` folder the installer opened.

Installed locations (per-user, no admin):
- Windows: `%LOCALAPPDATA%\PNE LC AI\`
- macOS: `~/Library/Application Support/PNE LC AI/`

## Known caveats

- **Developer mode must stay ON.** After a major Chrome update, Chrome may
  disable Developer-mode extensions. If "PNE LC AI" disappears, the user reopens
  `chrome://extensions`, confirms Developer mode is ON, and toggles it back on.
  No reinstall. The host chat app can also detect the missing content-script tag
  (`data-luminaExt`) and prompt the user to re-enable.
- **Code signing.** Unsigned installers warn (SmartScreen / Gatekeeper). Signing
  is optional but recommended — see each installer's README.
- **Chrome only (v1).** The native host is registered for Chrome's
  `NativeMessagingHosts` directory. Edge/Brave/Chromium use different paths.

## Troubleshooting

- Update not happening? Check `%LOCALAPPDATA%\PNE LC AI\updater.log`
  (`~/Library/Application Support/PNE LC AI/updater.log` on macOS) — the host
  logs each check there.
- "Specified native messaging host not found" in the SW console → the host
  manifest/registry wasn't installed, or the extension ID doesn't match
  `allowed_origins`. Confirm the loaded extension's ID is
  `glanidmlbocpbpihkbahamdipkkiiacb`.
- SHA-256 mismatch in the log → `latest.json` and the uploaded zip are out of
  sync; re-run `npm run release` and re-upload both.
