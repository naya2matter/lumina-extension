// content/receiver.ts
// Injected into the Lumina AI tab (localhost:5173).
// Bridges chrome.tabs.sendMessage from the popup to a CustomEvent
// that the React app can listen to via useExtensionCookies.

chrome.runtime.onMessage.addListener(
  (message: { type: string; psid: string; psidts: string }) => {
    if (message.type !== 'LUMINA_COOKIES') return

    window.dispatchEvent(
      new CustomEvent('lumina:gemini-cookies', {
        detail: { psid: message.psid, psidts: message.psidts },
      }),
    )
  },
)
