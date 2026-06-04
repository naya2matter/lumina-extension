// hooks/useExtensionCookies.ts
// Use in the Lumina AI React app to receive cookies forwarded by the
// browser extension via the lumina:gemini-cookies CustomEvent.
//
// Usage:
//   useExtensionCookies((psid, psidts) => {
//     setPsid(psid)
//     setPsidts(psidts)
//   })

import { useEffect } from 'react'

export function useExtensionCookies(
  onReceive: (psid: string, psidts: string) => void,
) {
  useEffect(() => {
    const handler = (event: CustomEvent<{ psid: string; psidts: string }>) => {
      onReceive(event.detail.psid, event.detail.psidts)
    }
    window.addEventListener('lumina:gemini-cookies', handler as EventListener)
    return () => {
      window.removeEventListener('lumina:gemini-cookies', handler as EventListener)
    }
  }, [onReceive])
}
