# PNE LC AI (Gemini Connector) — Self-Hosted Deployment

Install the extension on your team's Chrome browsers **without the Chrome Web Store**
and **without "Load unpacked"**, using Chrome's built-in policy mechanism. Each device
runs one small script (or installs one profile); the extension then auto-installs and
auto-updates from your server.

- **Extension ID:** `epcnjdecfbmgbbcpebihlfiklanlijeb` (permanent — tied to the signing key)
- **Hosting base URL:** `https://ai.lcportal.cloud/ext/`

---

## Step 1 — Host two files on your server

Upload these to `https://ai.lcportal.cloud/ext/`:

| File | Public URL |
|------|-----------|
| `pne-lc-ai.crx` | `https://ai.lcportal.cloud/ext/pne-lc-ai.crx` |
| `update.xml`    | `https://ai.lcportal.cloud/ext/update.xml` |

**Important server settings:**
- Serve over **HTTPS** (Chrome requires it for policy update URLs).
- Serve `pne-lc-ai.crx` with content type `application/x-chrome-extension`
  (or `application/octet-stream`). Do **not** let the server rewrite/compress it.
- Both URLs must be reachable by every user's browser.

Verify from any machine:
```
curl -I https://ai.lcportal.cloud/ext/update.xml     # expect 200
curl -I https://ai.lcportal.cloud/ext/pne-lc-ai.crx  # expect 200
```

---

## Step 2 — Install on each device

### Windows (no admin needed)
Send teammates `install-windows.ps1`, then have them run:
```powershell
powershell -ExecutionPolicy Bypass -File .\install-windows.ps1
```
Then fully quit Chrome and reopen (`chrome://restart`). The extension auto-installs.

Uninstall: `uninstall-windows.ps1`.

### macOS — option A (script, no MDM)
Send `install-mac.command`, then:
```bash
chmod +x install-mac.command && ./install-mac.command
```
Then quit Chrome (Cmd+Q) and reopen.

Uninstall: `uninstall-mac.command`.

### macOS — option B (configuration profile, cleaner)
Double-click `PNE-LC-AI.mobileconfig`, then approve it in
**System Settings → General → Device Management (Profiles)**. Chrome installs the
extension on next launch. Remove it by deleting the profile in the same panel.

---

## How updates work

To push a new version to every device automatically:
1. Bump `"version"` in `public/manifest.json`, run `npm run build`.
2. Re-pack the CRX **using the same signing key** (critical — keeps the same ID):
   ```
   chrome.exe --pack-extension="dist" --pack-extension-key="pne-lc-ai-signing-key.pem"
   ```
3. Update the `version` in `update.xml` to match.
4. Re-upload `pne-lc-ai.crx` and `update.xml`.

Chrome re-checks `update.xml` periodically and upgrades silently. No user action.

---

## Notes & caveats
- This is Chrome's **enterprise policy** mechanism used locally. It is the only
  sanctioned way to install silently outside the Web Store; a plain `.crx` download
  gets auto-disabled by Chrome, which is why the policy step is required.
- Force-installed extensions **cannot be removed by the user** from
  `chrome://extensions` (by design). Use the uninstall script/profile to remove.
- **`pne-lc-ai-signing-key.pem` (in the extension root) is secret.** Anyone with it can
  publish updates under your extension ID. Back it up somewhere safe and never commit
  it to git or ship it to users. Only `pne-lc-ai.crx` and `update.xml` go on the server.
- The extension ID above only applies to this key. If the key is ever lost, a new key
  produces a new ID and every device must be reconfigured.
