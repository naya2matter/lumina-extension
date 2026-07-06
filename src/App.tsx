import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { CheckCircle, AlertTriangle, Loader2, Copy, Zap } from 'lucide-react'
import './App.css'

interface CookieResponse {
  success: boolean
  psid: string | null
  psidts: string | null
  error: string | null
}

type ConnectPhase =
  | 'opening'
  | 'waiting'
  | 'capturing'
  | 'sending'
  | 'done'
  | 'error'

interface ConnectMessage {
  phase: ConnectPhase
  message?: string
  error?: string
}

type AuthStatus = 'checking' | 'ready' | 'no-auth'
type ResultState =
  | { type: 'success'; msg: string }
  | { type: 'error'; msg: string }
  | null

const isChromeExtension =
  typeof chrome !== 'undefined' &&
  typeof chrome.tabs !== 'undefined' &&
  typeof chrome.runtime !== 'undefined'

// Origins where the Lumina chat app runs (must match manifest content_scripts).
const CHAT_ORIGINS = ['localhost:5173', 'localhost:3000', '127.0.0.1:3000', 'ai.lcportal.cloud']

const PHASE_LABEL: Record<Exclude<ConnectPhase, 'done' | 'error'>, string> = {
  opening: 'Opening Gemini…',
  waiting: 'Waiting for Gemini sign-in…',
  capturing: 'Capturing cookies…',
  sending: 'Sending to Lumina…',
}

// Read the JWT directly from the active chat tab's localStorage using executeScript.
// This works even if the content script has not been injected yet (no pre-injection required).
async function getAuthTokenFromActiveTab(): Promise<string | null> {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const tab = tabs[0]
      const url = tab?.url ?? ''
      const onChat = CHAT_ORIGINS.some((o) => url.includes(o))
      if (tab?.id == null || !onChat) {
        resolve(null)
        return
      }
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => localStorage.getItem('auth_token'),
        })
        resolve((results[0]?.result as string | null) ?? null)
      } catch {
        resolve(null)
      }
    })
  })
}

function App() {
  const [authStatus, setAuthStatus] = useState<AuthStatus>('checking')
  const [token, setToken] = useState<string | null>(null)
  const [phase, setPhase] = useState<ConnectPhase | null>(null)
  const [copyLoading, setCopyLoading] = useState(false)
  const [result, setResult] = useState<ResultState>(null)

  useEffect(() => {
    if (!isChromeExtension) {
      setAuthStatus('no-auth')
      return
    }
    getAuthTokenFromActiveTab().then((t) => {
      setToken(t)
      setAuthStatus(t ? 'ready' : 'no-auth')
    })
  }, [])

  const connecting = phase != null && phase !== 'done' && phase !== 'error'

  const handleConnect = useCallback(() => {
    if (!isChromeExtension || !token) {
      setResult({ type: 'error', msg: 'Open the Lumina chat and sign in first.' })
      return
    }

    setResult(null)
    setPhase('opening')

    const port = chrome.runtime.connect({ name: 'connect-gemini' })
    port.onMessage.addListener((msg: ConnectMessage) => {
      if (msg.phase === 'done') {
        setPhase('done')
        setResult({ type: 'success', msg: msg.message ?? 'Gemini connected successfully.' })
        port.disconnect()
      } else if (msg.phase === 'error') {
        setPhase('error')
        setResult({ type: 'error', msg: msg.error ?? 'Failed to connect Gemini.' })
        port.disconnect()
      } else {
        setPhase(msg.phase)
      }
    })
    port.onDisconnect.addListener(() => {
      // If the worker went away mid-flow without a final message, surface it.
      setPhase((p) => (p === 'done' || p === 'error' ? p : null))
    })

    port.postMessage({ type: 'CONNECT_GEMINI', token })
  }, [token])

  const handleCopy = useCallback(() => {
    if (!isChromeExtension) {
      setResult({
        type: 'error',
        msg: 'Extension APIs are unavailable. Load this app inside the extension popup.',
      })
      return
    }

    setCopyLoading(true)
    setResult(null)
    chrome.runtime.sendMessage(
      { type: 'GET_GEMINI_COOKIES' },
      async (response: CookieResponse) => {
        if (!response.psid || !response.psidts) {
          setResult({ type: 'error', msg: response.error ?? 'Failed to read cookies.' })
          setCopyLoading(false)
          return
        }
        try {
          await navigator.clipboard.writeText(
            `PSID: ${response.psid}\nPSIDTS: ${response.psidts}`,
          )
          setResult({
            type: 'success',
            msg: 'Copied! Paste into the Lumina AI connect screen.',
          })
        } catch {
          setResult({ type: 'error', msg: 'Clipboard write failed.' })
        }
        setCopyLoading(false)
      },
    )
  }, [])

  const busy = connecting || copyLoading

  return (
    <div className="page-shell">
      <div className="popup">
        <header className="popup-header">
          <div className="brand-row">
            <div className="brand-mark">L</div>
            <div>
              <h1 className="popup-title">Lumina AI</h1>
              <p className="popup-subtitle">Gemini Connector</p>
            </div>
          </div>
          <p className="popup-hint">
            One click opens Gemini, captures your session, and connects it to Lumina.
          </p>
        </header>

        <div className="popup-body">
          <div className="status-panel">
            <div
              className={`badge ${
                authStatus === 'ready'
                  ? 'badge--success'
                  : authStatus === 'checking'
                    ? 'badge--muted'
                    : 'badge--warning'
              }`}
            >
              {authStatus === 'checking' && 'Checking…'}
              {authStatus === 'ready' && '✓ Signed in to Lumina'}
              {authStatus === 'no-auth' && '⚠ Open Lumina & sign in'}
            </div>
            <p className="status-copy">
              {connecting
                ? PHASE_LABEL[phase as Exclude<ConnectPhase, 'done' | 'error'>]
                : authStatus === 'ready'
                  ? 'Click below — a Gemini tab opens, signs you in, and closes automatically.'
                  : 'Open your Lumina chat tab and sign in, then reopen this popup.'}
            </p>
          </div>

          <div className="action-grid">
            <Button
              onClick={handleConnect}
              disabled={authStatus !== 'ready' || busy}
              className="button-full"
            >
              {connecting ? (
                <>
                  <Loader2 className="icon-spin" />
                  {PHASE_LABEL[phase as Exclude<ConnectPhase, 'done' | 'error'>]}
                </>
              ) : (
                <>
                  <Zap />
                  Connect Gemini Automatically
                </>
              )}
            </Button>

            <Button
              variant="outline"
              onClick={handleCopy}
              disabled={busy}
              className="button-full"
            >
              {copyLoading ? (
                <>
                  <Loader2 className="icon-spin" />
                  Copying…
                </>
              ) : (
                <>
                  <Copy />
                  Copy Cookies (manual fallback)
                </>
              )}
            </Button>
          </div>

          {result !== null && (
            <div className={`result result--${result.type}`}>
              {result.type === 'success' ? (
                <CheckCircle size={16} />
              ) : (
                <AlertTriangle size={16} />
              )}
              <span>{result.msg}</span>
            </div>
          )}
        </div>

        <footer className="popup-footer">
          Your cookies are sent only to your Lumina AI instance. They are never stored by this extension.
        </footer>
      </div>
    </div>
  )
}

export default App
