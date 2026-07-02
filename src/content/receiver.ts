// content/receiver.ts
// Injected into the Lumina AI tab AND the embedded widget iframe (all_frames).
// Three jobs:
//  1. Mark that the extension is installed so the page/widget can detect it.
//  2. Hand the popup the user's JWT (read from the page's localStorage) so the
//     extension can call the backend directly.
//  3. Drive the "Connect Gemini" button: relay lumina:connect-gemini to the
//     background service worker over a port, and relay its progress messages
//     back as lumina:gemini-status CustomEvents. Also keep the legacy
//     LUMINA_COOKIES bridge for the old copy-paste flow.

document.documentElement.dataset.luminaExt = '1'

chrome.runtime.onMessage.addListener(
  (
    message: { type: string; psid?: string; psidts?: string },
    _sender,
    sendResponse: (response?: { token: string | null }) => void,
  ) => {
    if (message.type === 'GET_AUTH_TOKEN') {
      sendResponse({ token: localStorage.getItem('auth_token') })
      return true
    }

    if (message.type === 'LUMINA_COOKIES') {
      window.dispatchEvent(
        new CustomEvent('lumina:gemini-cookies', {
          detail: { psid: message.psid, psidts: message.psidts },
        }),
      )
    }
  },
)

window.addEventListener('lumina:connect-gemini', (e) => {
  const token = (e as CustomEvent<{ token?: string }>).detail?.token
  const port = chrome.runtime.connect({ name: 'connect-gemini' })
  port.onMessage.addListener((msg) => {
    window.dispatchEvent(new CustomEvent('lumina:gemini-status', { detail: msg }))
  })
  port.postMessage({ type: 'CONNECT_GEMINI', token })
})
