# Lumina AI — Gemini Connector (Chrome Extension)

A Manifest V3 Chrome extension that connects your Google Gemini session to Lumina AI
in **one click** — no manual cookie copying.

## What it does

When you click **Connect Gemini Automatically**, the extension:

1. Reads your logged-in Lumina session token from the active chat tab.
2. Opens a Gemini tab (`gemini.google.com`) and waits for it to load / for you to sign in.
3. Extracts your Gemini session cookies (`__Secure-1PSID`, `__Secure-1PSIDTS`).
4. Closes the Gemini tab.
5. Sends the cookies directly to the Lumina backend (`POST /api/cookies`) with your token.

Cookies are held in memory only and forwarded directly — the extension never stores them.

## Distribution & auto-update (for end users)

This extension is distributed **privately from our own server** — not the Chrome
Web Store. Normal Windows/Mac users install it with a small no-admin installer
and a one-time "Load unpacked"; it then updates itself automatically from
`https://ai.lcportal.cloud/ext/`. See **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**
for the full pipeline (identity, releases, installers, hosting).

Quick map:
- `scripts/gen-key.mjs` — pins the extension ID (`key` in the manifest). Run once.
- `scripts/release.mjs` (`npm run release`) — builds + zips `dist/` and writes `latest.json`.
- `updater/` — the Go native-messaging host that performs on-disk updates.
- `installers/windows`, `installers/mac` — the per-user installers users run.

## Dev setup

```bash
npm install
npm run build
```

Then load it in Chrome for local development:

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top-right).
3. Click **Load unpacked** and select the `dist/` folder.

Because `public/manifest.json` now contains a `key`, the loaded extension always
gets the stable ID `glanidmlbocpbpihkbahamdipkkiiacb`.

## Usage

1. Install the Lumina Extension in Chrome (see Setup).
2. Open the Lumina chat app and **sign in**.
3. With the chat tab active, click the Lumina extension icon in your toolbar.
4. Click **Connect Gemini Automatically** in the popup.
5. If you are not already signed into Google, sign in on the Gemini tab that opens —
   the extension detects it automatically, closes the tab, and finishes the connection.

That's it. You no longer need to open `gemini.google.com` or copy cookies by hand.

> **Manual fallback:** the **Copy Cookies** button still reads the Gemini cookies of the
> current tab and copies them to your clipboard, in case you want to paste them into the
> Lumina connect screen yourself.

## Configuration

- **Backend URL** — set in `public/background.js` (`DEFAULT_BACKEND_URL`, defaults
  to `https://backend.ai.lcportal.cloud`). The popup also derives the backend
  per active chat-tab origin (`backendUrlForOrigin` in `src/App.tsx`). Update
  these and the `host_permissions`/CSP in `public/manifest.json` when changing
  backends.
- **Chat origins** — the popup looks for the chat tab on the origins listed in
  `CHAT_ORIGINS` (`src/App.tsx`) and `content_scripts` (`public/manifest.json`).
- **Update URL** — the self-hosted update manifest location is
  `https://ai.lcportal.cloud/ext/latest.json` (constant `defaultManifestURL` in
  `updater/main.go`; override for testing with `LC_UPDATE_MANIFEST_URL`).

## Project structure

- `public/manifest.json` — MV3 manifest (`key`, permissions, host permissions, content script).
- `public/background.js` — service worker; connect flow, cookie reads, and the update check.
- `src/App.tsx` — popup UI (single-click connect + progress + manual fallback + version line).
- `src/content/receiver.ts` — content script; exposes the auth token to the popup.
- `updater/` — Go native-messaging host that self-updates the unpacked extension.
- `installers/` — per-user Windows (Inno Setup) and macOS (`.pkg`) installers.
- `scripts/` — icon/key generation and the release packager.
- `docs/DEPLOYMENT.md` — full distribution & update guide.
