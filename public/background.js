// background.js — Service worker (Manifest V3)
// Reads Gemini session cookies on demand and returns them to the popup.
// Cookies are never stored or logged — they are forwarded directly in memory.

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== 'GET_GEMINI_COOKIES') return;

  Promise.all([
    chrome.cookies.get({ url: 'https://gemini.google.com', name: '__Secure-1PSID' }),
    chrome.cookies.get({ url: 'https://gemini.google.com', name: '__Secure-1PSIDTS' }),
  ])
    .then(([psid, psidts]) => {
      sendResponse({
        success: !!(psid && psidts),
        psid: psid?.value ?? null,
        psidts: psidts?.value ?? null,
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
