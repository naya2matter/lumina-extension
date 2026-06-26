// content/receiver.ts
// Injected into the Lumina AI tab (the chat app).
// Two jobs:
//  1. Hand the popup the user's JWT (read from the page's localStorage) so the
//     extension can call the backend directly.
//  2. Legacy bridge: forward LUMINA_COOKIES to a CustomEvent for the React app.

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
