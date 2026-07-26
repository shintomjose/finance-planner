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

/** localStorage key for the persisted access token. Google access tokens are
 * ~1h bearer tokens; persisting them means a page reload inside that hour
 * reuses the token instead of prompting again. Personal-device tradeoff
 * accepted by the owner (single-user app, readonly scope). */
const TOKEN_STORE_KEY = 'fp-token-v1'

function persistToken(): void {
  try {
    localStorage.setItem(TOKEN_STORE_KEY, JSON.stringify({ token: currentToken, expiresAt }))
  } catch {
    /* storage full/blocked — token just won't survive reload */
  }
}

/** Restores a still-valid persisted token into module state. Returns it, or
 * null when absent/expired (expired entries are removed). */
function restoreToken(): string | null {
  try {
    const raw = localStorage.getItem(TOKEN_STORE_KEY)
    if (!raw) return null
    const { token, expiresAt: exp } = JSON.parse(raw) as { token?: string; expiresAt?: number }
    if (typeof token === 'string' && typeof exp === 'number' && Date.now() < exp - EXPIRY_SAFETY_MS) {
      currentToken = token
      expiresAt = exp
      return token
    }
    localStorage.removeItem(TOKEN_STORE_KEY)
  } catch {
    /* corrupt entry — ignore */
  }
  return null
}
/** Resolvers for in-flight silentReauth() calls — handleToken settles every
 * pending one (success or failure) whenever the fixed GIS callback fires,
 * since the token client's callback is set once at initTokenClient() time
 * and can't be overridden per requestAccessToken() call. */
let pendingSilentResolvers: Array<(token: string | null) => void> = []

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
  const resolvers = pendingSilentResolvers
  pendingSilentResolvers = []
  if (resp.error || !resp.access_token) {
    resolvers.forEach((resolve) => resolve(null))
    return
  }
  currentToken = resp.access_token
  expiresAt = Date.now() + resp.expires_in * 1000
  persistToken()
  onToken(currentToken)
  resolvers.forEach((resolve) => resolve(currentToken))
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
  // A reload within the token's ~1h lifetime reuses the persisted token
  // immediately — no GIS round-trip, no prompt. The token client is still
  // initialized below so later silentReauth()/signIn() calls work.
  const restored = restoreToken()
  loadGisScript()
    .then(() => {
      const google = window.google
      if (!google) throw new Error('Google Identity Services failed to load')
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CONFIG.clientId,
        scope: SCOPE,
        callback: (resp) => handleToken(resp, onToken),
      })
      if (!restored) tokenClient.requestAccessToken({ prompt: '' })
    })
    .catch((err: unknown) => {
      console.error('[gis] initAuth failed:', err)
    })
  if (restored) onToken(restored)
}

/** One silent re-auth attempt (`prompt: ''`) for recovering from a token
 * that expired mid-session (AuthExpiredError from a Sheets API call) without
 * bouncing the user to the sign-in screen. Resolves the new token on
 * success, or null if the silent flow didn't produce one (e.g. GIS revoked
 * consent, or no response within `timeoutMs`) — callers should treat null
 * as "fall back to interactive sign-in", never retry silently again for
 * that same load cycle. Never rejects. */
export function silentReauth(timeoutMs = 5000): Promise<string | null> {
  return new Promise((resolve) => {
    if (!tokenClient) {
      resolve(null)
      return
    }
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      resolve(null)
    }, timeoutMs)
    pendingSilentResolvers.push((token) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(token)
    })
    tokenClient.requestAccessToken({ prompt: '' })
  })
}

/** Interactive sign-in — call from a user gesture (e.g. a "Connect" button)
 * when silent auth didn't produce a token. */
export function signIn(): void {
  if (!tokenClient) {
    console.error('[gis] signIn() called before initAuth()')
    return
  }
  // No prompt override: Google shows the consent screen only when it has to
  // (first grant, revoked consent) instead of on every interactive sign-in.
  tokenClient.requestAccessToken()
}
