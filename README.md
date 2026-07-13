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

## Setup

```bash
npm install
npm run build
```

Then load it in Chrome:

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top-right).
3. Click **Load unpacked** and select the `dist/` folder.

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

- **Backend URL** — set in `public/background.js` (`BACKEND_URL`, defaults to
  `http://127.0.0.1:8000`). Update it and the `host_permissions` in
  `public/manifest.json` when deploying to production.
- **Chat origins** — the popup looks for the chat tab on the origins listed in
  `CHAT_ORIGINS` (`src/App.tsx`) and `content_scripts` (`public/manifest.json`).

## Project structure

- `public/manifest.json` — MV3 manifest (permissions, host permissions, content script).
- `public/background.js` — service worker; orchestrates the connect flow and reads cookies.
- `src/App.tsx` — popup UI (single-click connect + progress + manual fallback).
- `src/content/receiver.ts` — content script; exposes the auth token to the popup.
