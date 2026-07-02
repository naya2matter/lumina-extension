// background.js — Service worker (Manifest V3)
// Orchestrates the one-click Gemini connect flow and reads session cookies.
// Cookies are never stored or logged — they are forwarded directly in memory.

const BACKEND_URL = 'http://127.0.0.1:8000'; // change to your production API URL when deploying
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
    runConnectFlow(message.token, report);
  });
});

async function runConnectFlow(token, report) {
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
    const res = await fetch(`${BACKEND_URL}/api/cookies`, {
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
