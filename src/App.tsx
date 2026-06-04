import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { CheckCircle, AlertTriangle, Loader2, Copy, Zap } from 'lucide-react'
import './App.css'

// Change to your production URL when deploying
const LUMINA_URL = 'http://localhost:5173'

interface CookieResponse {
  success: boolean
  psid: string | null
  psidts: string | null
  error: string | null
}

type TabStatus = 'checking' | 'ready' | 'no-gemini'
type ResultState =
  | { type: 'success'; msg: string }
  | { type: 'error'; msg: string }
  | null

const isChromeExtension =
  typeof chrome !== 'undefined' &&
  typeof chrome.tabs !== 'undefined' &&
  typeof chrome.runtime !== 'undefined'

async function sendToLumina(psid: string, psidts: string): Promise<void> {
  if (!isChromeExtension) {
    throw new Error('Extension APIs are unavailable.')
  }

  const tabs = await chrome.tabs.query({ url: `${LUMINA_URL}/*` })
  const tabId = tabs[0]?.id
  if (tabId == null) throw new Error('No Lumina AI tab found. Open it first.')
  await chrome.tabs.sendMessage(tabId, { type: 'LUMINA_COOKIES', psid, psidts })
}

function App() {
  const [tabStatus, setTabStatus] = useState<TabStatus>('checking')
  const [loading, setLoading] = useState<'capture' | 'copy' | null>(null)
  const [result, setResult] = useState<ResultState>(null)

  useEffect(() => {
    if (!isChromeExtension) {
      setTabStatus('no-gemini')
      return
    }

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const url = tabs[0]?.url ?? ''
      setTabStatus(url.includes('gemini.google.com') ? 'ready' : 'no-gemini')
    })
  }, [])

  const handleCapture = useCallback(() => {
    if (!isChromeExtension) {
      setResult({
        type: 'error',
        msg: 'Extension APIs are unavailable. Load this app inside the extension popup.',
      })
      return
    }

    setLoading('capture')
    setResult(null)
    chrome.runtime.sendMessage(
      { type: 'GET_GEMINI_COOKIES' },
      async (response: CookieResponse) => {
        if (!response.success || !response.psid || !response.psidts) {
          setResult({
            type: 'error',
            msg:
              response.error ??
              'Failed to read cookies. Make sure you are signed into Gemini.',
          })
          setLoading(null)
          return
        }
        try {
          await sendToLumina(response.psid, response.psidts)
          setResult({ type: 'success', msg: 'Cookies sent to Lumina AI successfully.' })
        } catch (err) {
          setResult({
            type: 'error',
            msg:
              err instanceof Error
                ? err.message
                : 'Could not send to Lumina AI. Use "Copy to Clipboard" instead.',
          })
        }
        setLoading(null)
      },
    )
  }, [])

  const handleCopy = useCallback(() => {
    if (!isChromeExtension) {
      setResult({
        type: 'error',
        msg: 'Extension APIs are unavailable. Load this app inside the extension popup.',
      })
      return
    }

    setLoading('copy')
    setResult(null)
    chrome.runtime.sendMessage(
      { type: 'GET_GEMINI_COOKIES' },
      async (response: CookieResponse) => {
        if (!response.psid || !response.psidts) {
          setResult({ type: 'error', msg: response.error ?? 'Failed to read cookies.' })
          setLoading(null)
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
        setLoading(null)
      },
    )
  }, [])

  return (
    <div className="popup">
      <header className="popup-header">
        <h1 className="popup-title">Lumina AI</h1>
        <p className="popup-subtitle">Gemini Cookie Helper</p>
      </header>

      <div className="popup-body">
        <div
          className={`badge ${
            tabStatus === 'ready'
              ? 'badge--success'
              : tabStatus === 'checking'
                ? 'badge--muted'
                : 'badge--warning'
          }`}
        >
          {tabStatus === 'checking' && 'Checking\u2026'}
          {tabStatus === 'ready' && '\u2713 Gemini tab detected'}
          {tabStatus === 'no-gemini' && '\u26a0 Open Gemini first'}
        </div>

        <p className="popup-description">
          Click below to read your Gemini session cookies and send them to Lumina AI.
        </p>

        <div className="popup-actions">
          <Button
            onClick={handleCapture}
            disabled={tabStatus !== 'ready' || loading !== null}
            className="w-full"
          >
            {loading === 'capture' ? (
              <>
                <Loader2 className="animate-spin" />
                Capturing\u2026
              </>
            ) : (
              <>
                <Zap />
                Capture &amp; Send to Lumina AI
              </>
            )}
          </Button>

          <Button
            variant="outline"
            onClick={handleCopy}
            disabled={loading !== null}
            className="w-full"
          >
            {loading === 'copy' ? (
              <>
                <Loader2 className="animate-spin" />
                Copying\u2026
              </>
            ) : (
              <>
                <Copy />
                Copy to Clipboard
              </>
            )}
          </Button>
        </div>

        {result !== null && (
          <div className={`result result--${result.type}`}>
            {result.type === 'success' ? (
              <CheckCircle size={15} />
            ) : (
              <AlertTriangle size={15} />
            )}
            <span>{result.msg}</span>
          </div>
        )}

        <footer className="popup-footer">
          Your cookies are sent only to your Lumina AI instance. They are never stored
          by this extension.
        </footer>
      </div>
    </div>
  )
}

export default App
