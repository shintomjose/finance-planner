// Google Identity Services (GIS) token flow (SKILL.md "Sheets API + GIS
// pattern"). Browser-only, no gapi client needed. Deliberately free of
// import-time side effects: nothing runs until initAuth() is called, so this
// module is safe to import from anywhere (it is excluded from unit tests —
// there is no DOM/script-loading environment to test it against here).
import { CONFIG } from '../config'

const GIS_SRC = 'https://accounts.google.com/gsi/client'
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly'
/** Token is treated as expired this long before its real expiry, so a
 * fetch started just before the true deadline never races an in-flight
 * 401. */
const EXPIRY_SAFETY_MS = 60_000

interface TokenResponse {
  access_token: string
  expires_in: number
  error?: string
}
interface TokenClient {
  requestAccessToken(overrideConfig?: { prompt?: string }): void
}
interface TokenClientConfig {
  client_id: string
  scope: string
  callback: (resp: TokenResponse) => void
}
interface GoogleAccounts {
  oauth2: {
    initTokenClient(config: TokenClientConfig): TokenClient
  }
}

declare global {
  interface Window {
    google?: { accounts: GoogleAccounts }
  }
}

let scriptPromise: Promise<void> | null = null
let tokenClient: TokenClient | null = null
let currentToken: string | null = null
let expiresAt = 0

/** Injects the GIS script exactly once, resolving once it has loaded. */
function loadGisScript(): Promise<void> {
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`)
    if (existing) {
      resolve()
      return
    }
    const script = document.createElement('script')
    script.src = GIS_SRC
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Google Identity Services script'))
    document.head.appendChild(script)
  })
  return scriptPromise
}

function handleToken(resp: TokenResponse, onToken: (t: string) => void): void {
  if (resp.error || !resp.access_token) return
  currentToken = resp.access_token
  expiresAt = Date.now() + resp.expires_in * 1000
  onToken(currentToken)
}

/** Current access token, or null if absent/expired (with a 60s safety
 * margin) — SheetsClient's getToken callback should point here. */
export function getToken(): string | null {
  if (currentToken && Date.now() < expiresAt - EXPIRY_SAFETY_MS) return currentToken
  return null
}

/** Loads the GIS script, creates the token client, and requests a token
 * silently (`prompt: ''`) — succeeds without a prompt if the user already
 * consented in this browser, otherwise the callback simply never fires and
 * the caller falls back to signIn() on first use. */
export function initAuth(onToken: (t: string) => void): void {
  loadGisScript()
    .then(() => {
      const google = window.google
      if (!google) throw new Error('Google Identity Services failed to load')
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CONFIG.clientId,
        scope: SCOPE,
        callback: (resp) => handleToken(resp, onToken),
      })
      tokenClient.requestAccessToken({ prompt: '' })
    })
    .catch((err: unknown) => {
      console.error('[gis] initAuth failed:', err)
    })
}

/** Interactive sign-in — call from a user gesture (e.g. a "Connect" button)
 * when silent auth didn't produce a token. */
export function signIn(): void {
  if (!tokenClient) {
    console.error('[gis] signIn() called before initAuth()')
    return
  }
  tokenClient.requestAccessToken({ prompt: 'consent' })
}
