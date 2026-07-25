// App shell (Task 10). Flow: mount -> initAuth (silent) -> token -> new
// SheetsClient(getToken) -> loadMonths -> ready. No token -> SignIn screen.
// AuthExpiredError from loadMonths -> one silent re-auth attempt
// (src/lib/authRetry.ts) and a single retry of loadMonths; only if THAT
// still fails on auth -> back to SignIn with a "session expired" note.
// Fetch failures that still leave cached months (per-tab 'fetch-failed'
// issues but months.length > 0) -> ready + banner (scoped to the displayed
// tab only — src/lib/banner.ts) plus a small nav chip for any other tabs
// that failed. A load that yields zero months (fetch failed for everything,
// or a genuine hard error) -> error state with retry.
import { useCallback, useEffect, useState } from 'react'
import { getToken, initAuth, signIn, silentReauth } from '../api/gis'
import { AuthExpiredError, SheetsClient } from '../api/sheets'
import { loadMonths } from '../data/orchestrator'
import { loadWithSilentReauth } from '../lib/authRetry'
import { bannerFor } from '../lib/banner'
import { pickDisplayedMonth } from '../lib/period'
import type { MonthData, ParserIssue } from '../types'
import { Layout, SCREEN_REGISTRY } from './Layout'
import type { ScreenId } from './Layout'
import { SignIn } from './SignIn'
import { LoadingState } from './shared'
import './app.css'

type AppState =
  | { kind: 'unauthenticated'; note?: string }
  | { kind: 'loading' }
  | { kind: 'ready'; months: MonthData[]; issues: ParserIssue[] }
  | { kind: 'error'; message: string }

type Tab = ScreenId

// Stable for the lifetime of the page load: both the orchestrator's
// "which tab is current" check and Overview's fallback logic need to agree
// on the same instant, and there's no reason to recompute it on rerenders.
const now = new Date()

export default function App() {
  const [state, setState] = useState<AppState>({ kind: 'unauthenticated' })
  const [tab, setTab] = useState<Tab>('overview')
  const [hasToken, setHasToken] = useState(false)

  useEffect(() => {
    initAuth(() => setHasToken(true))
  }, [])

  const load = useCallback(async () => {
    setState({ kind: 'loading' })
    const client = new SheetsClient(getToken)
    try {
      const outcome = await loadWithSilentReauth(
        () => loadMonths(client, now),
        silentReauth,
        (err) => err instanceof AuthExpiredError,
      )
      if (outcome.status === 'unauthenticated') {
        setHasToken(false)
        setState({ kind: 'unauthenticated', note: 'Session expired — please sign in again.' })
        return
      }
      const result = outcome.value
      if (result.months.length === 0) {
        const detail = result.issues.map((i) => `${i.sheet}: ${i.detail}`).join('; ')
        setState({ kind: 'error', message: detail || 'No month data could be loaded.' })
        return
      }
      setState({ kind: 'ready', months: result.months, issues: result.issues })
    } catch (err) {
      setState({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }, [])

  useEffect(() => {
    if (hasToken) void load()
  }, [hasToken, load])

  const retry = () => {
    if (getToken()) void load()
    else signIn()
  }

  if (state.kind === 'unauthenticated') return <SignIn note={state.note} />
  if (state.kind === 'loading') {
    return (
      <div className="status">
        <LoadingState label="Loading…" />
      </div>
    )
  }
  if (state.kind === 'error') {
    return (
      <div className="status error">
        <p>{state.message}</p>
        <button onClick={retry}>Retry</button>
      </div>
    )
  }

  // `state.months` is non-empty here (the load() branch above routes
  // zero-month results to the 'error' state before ever reaching 'ready'),
  // so pickDisplayedMonth always returns a month — no fallback needed.
  const displayedTab = pickDisplayedMonth(state.months, now)!.tab
  const { bannerForDisplayedTab, otherFailedTabCount } = bannerFor(state.issues, displayedTab)

  return (
    <Layout
      active={tab}
      onNavigate={setTab}
      issueCount={state.issues.length}
      banner={bannerForDisplayedTab ? <p className="banner">Showing cached data</p> : undefined}
      chip={
        otherFailedTabCount > 0 ? (
          <span className="chip" title="Other months failed to refresh — see Parser Health for details">
            {otherFailedTabCount} tab{otherFailedTabCount === 1 ? '' : 's'} failed to load
          </span>
        ) : undefined
      }
      screenProps={{ months: state.months, issues: state.issues, now, label: SCREEN_REGISTRY[tab].label }}
    />
  )
}
