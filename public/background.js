// background.js — Service worker (Manifest V3)
// Orchestrates the one-click Gemini connect flow and reads session cookies.
// Cookies are never stored or logged — they are forwarded directly in memory.

// Backend URL is passed per-message from the popup so the same extension works
// against both local (http://127.0.0.1:8000) and production (https://backend.ai.lcportal.cloud).
const DEFAULT_BACKEND_URL = 'https://backend.ai.lcportal.cloud';
const GEMINI_URL = 'https://gemini.google.com/app';
const POLL_INTERVAL_MS = 1000;
const POLL_TIMEOUT_MS = 120000; // 2 minutes to allow a manual Google sign-in

// --- Cookie helpers -------------------------------------------------------

function readGeminiCookies() {
  return Promise.all([
    chrome.cookies.get({ url: 'https://gemini.google.com', name: '__Secure-1PSID' }),
    chrome.cookies.get({ url: 'https://gemini.google.com', name: '__Secure-1PSIDTS' }),
  ]).then(([psid, psidts]) => ({
    psid: psid?.value ?? null,
    psidts: psidts?.value ?? null,
  }));
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// --- Legacy popup message: read cookies on demand (Copy-to-Clipboard) -----

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== 'GET_GEMINI_COOKIES') return;

  readGeminiCookies()
    .then(({ psid, psidts }) => {
      sendResponse({
        success: !!(psid && psidts),
        psid,
        psidts,
        error:
          !psid || !psidts
            ? 'Cookies not found. Make sure you are signed in to Gemini.'
            : null,
      });
    })
    .catch((err) => {
      sendResponse({ success: false, psid: null, psidts: null, error: err.message });
    });

  return true; // Keep message channel open for async response
});

// --- One-click connect flow (port-based, survives popup close) ------------

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'connect-gemini') return;

  let portOpen = true;
  port.onDisconnect.addListener(() => {
    portOpen = false;
  });

  // Best-effort progress reporting — popup may have closed.
  const report = (msg) => {
    if (!portOpen) return;
    try {
      port.postMessage(msg);
    } catch {
      portOpen = false;
    }
  };

  port.onMessage.addListener((message) => {
    if (message.type !== 'CONNECT_GEMINI') return;
    const backendUrl = message.backendUrl || DEFAULT_BACKEND_URL;
    runConnectFlow(message.token, backendUrl, report);
  });
});

async function runConnectFlow(token, backendUrl, report) {
  if (!token) {
    report({ phase: 'error', error: 'Not signed in to Lumina. Open the chat and sign in first.' });
    return;
  }

  let geminiTabId = null;
  let closedByUs = false;
  let userClosedTab = false;

  const onRemoved = (tabId) => {
    if (tabId === geminiTabId && !closedByUs) userClosedTab = true;
  };
  chrome.tabs.onRemoved.addListener(onRemoved);

  try {
    // 1. Open Gemini (visible) so the user can sign in if needed.
    report({ phase: 'opening' });
    const tab = await chrome.tabs.create({ url: GEMINI_URL, active: true });
    geminiTabId = tab.id;

    // 2. Poll for both cookies until found, the user closes the tab, or timeout.
    report({ phase: 'waiting' });
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    let psid = null;
    let psidts = null;

    while (Date.now() < deadline) {
      if (userClosedTab) {
        throw new Error('Gemini tab was closed before sign-in completed.');
      }
      ({ psid, psidts } = await readGeminiCookies());
      if (psid && psidts) break;
      await sleep(POLL_INTERVAL_MS);
    }

    if (!psid || !psidts) {
      throw new Error('Timed out waiting for Gemini sign-in. Please try again.');
    }

    // 3. Capture done — close the Gemini tab.
    report({ phase: 'capturing' });
    if (geminiTabId != null) {
      closedByUs = true;
      try {
        await chrome.tabs.remove(geminiTabId);
      } catch {
        /* tab may already be gone */
      }
    }

    // 4. Send straight to the backend with the user's JWT.
    report({ phase: 'sending' });
    const res = await fetch(`${backendUrl}/api/cookies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ psid, psidts }),
    });

    if (!res.ok) {
      let detail = `Backend returned ${res.status}.`;
      try {
        const body = await res.json();
        if (body?.detail) detail = body.detail;
      } catch {
        /* non-JSON error body */
      }
      throw new Error(detail);
    }

    report({ phase: 'done', message: 'Gemini connected successfully.' });
  } catch (err) {
    // Clean up the tab if we opened it and it is still around.
    if (geminiTabId != null && !closedByUs && !userClosedTab) {
      closedByUs = true;
      try {
        await chrome.tabs.remove(geminiTabId);
      } catch {
        /* ignore */
      }
    }
    report({ phase: 'error', error: err instanceof Error ? err.message : String(err) });
  } finally {
    chrome.tabs.onRemoved.removeListener(onRemoved);
  }
}

// --- Self-hosted auto-update ----------------------------------------------
// This extension is loaded UNPACKED (no Chrome Web Store), so Chrome never
// checks for updates on its own. An unpacked extension also cannot rewrite its
// own source files, so a small per-user native helper (installed alongside the
// extension) does the download + on-disk swap; we then reload() to load the new
// files. `chrome.runtime.reload()` reloads an unpacked extension from disk and
// re-fires onInstalled with reason "update" — that is the mechanism here.
//
// If the helper isn't installed (e.g. someone loaded the folder by hand), the
// connectNative call just disconnects with an error and the extension keeps
// working — update checks silently no-op.

const UPDATER_HOST = 'com.pneunited.lc_updater';
const UPDATE_ALARM = 'lc-update-check';
const UPDATE_PERIOD_MIN = 360; // every 6 hours

function checkForUpdate() {
  let settled = false;
  let port;

  const finish = (andThen) => {
    if (settled) return;
    settled = true;
    try {
      port?.disconnect();
    } catch {
      /* already disconnected */
    }
    andThen?.();
  };

  try {
    port = chrome.runtime.connectNative(UPDATER_HOST);
  } catch (err) {
    console.debug('[updater] native host unavailable:', err?.message ?? err);
    return;
  }

  port.onMessage.addListener((msg) => {
    if (msg?.status === 'updated') {
      console.info(`[updater] updated to ${msg.version} — reloading extension.`);
      finish(() => chrome.runtime.reload());
    } else {
      if (msg?.status === 'error') console.warn('[updater]', msg.message);
      finish(); // 'current' or unknown — nothing to do
    }
  });

  port.onDisconnect.addListener(() => {
    // Fires (with lastError set) when the host isn't registered — expected, benign.
    if (chrome.runtime.lastError) {
      console.debug('[updater] host disconnected:', chrome.runtime.lastError.message);
    }
    finish();
  });

  try {
    port.postMessage({ cmd: 'check', currentVersion: chrome.runtime.getManifest().version });
  } catch (err) {
    console.debug('[updater] could not reach host:', err?.message ?? err);
    finish();
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(UPDATE_ALARM, { periodInMinutes: UPDATE_PERIOD_MIN });
  checkForUpdate();
});

chrome.runtime.onStartup.addListener(checkForUpdate);

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === UPDATE_ALARM) checkForUpdate();
});

// Let the popup trigger a manual "Check for updates".
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'CHECK_FOR_UPDATE') return;
  checkForUpdate();
  sendResponse({ ok: true });
  return false;
});
