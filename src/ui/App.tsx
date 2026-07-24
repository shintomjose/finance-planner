// App shell (Task 10). Flow: mount -> initAuth (silent) -> token -> new
// SheetsClient(getToken) -> loadMonths -> ready. No token -> SignIn screen.
// AuthExpiredError from loadMonths -> back to SignIn with a "session
// expired" note. Fetch failures that still leave cached months (per-tab
// 'fetch-failed' issues but months.length > 0) -> ready + banner. A load
// that yields zero months (fetch failed for everything, or a genuine hard
// error) -> error state with retry.
import { useCallback, useEffect, useState } from 'react'
import { getToken, initAuth, signIn } from '../api/gis'
import { AuthExpiredError, SheetsClient } from '../api/sheets'
import { loadMonths } from '../data/orchestrator'
import type { MonthData, ParserIssue } from '../types'
import { Overview } from './Overview'
import { ParserHealth } from './ParserHealth'
import { SignIn } from './SignIn'
import './app.css'

type AppState =
  | { kind: 'unauthenticated'; note?: string }
  | { kind: 'loading' }
  | { kind: 'ready'; months: MonthData[]; issues: ParserIssue[]; cachedBanner: boolean }
  | { kind: 'error'; message: string }

type Tab = 'overview' | 'health'

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
      const result = await loadMonths(client, now)
      if (result.months.length === 0) {
        const detail = result.issues.map((i) => `${i.sheet}: ${i.detail}`).join('; ')
        setState({ kind: 'error', message: detail || 'No month data could be loaded.' })
        return
      }
      const cachedBanner = result.issues.some((i) => i.kind === 'fetch-failed')
      setState({ kind: 'ready', months: result.months, issues: result.issues, cachedBanner })
    } catch (err) {
      if (err instanceof AuthExpiredError) {
        setHasToken(false)
        setState({ kind: 'unauthenticated', note: 'Session expired — please sign in again.' })
        return
      }
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
  if (state.kind === 'loading') return <p className="status">Loading…</p>
  if (state.kind === 'error') {
    return (
      <div className="status error">
        <p>{state.message}</p>
        <button onClick={retry}>Retry</button>
      </div>
    )
  }

  return (
    <div className="app">
      <header>
        <h1>Finance Planner</h1>
        <nav className="tabs">
          <button className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}>
            Overview
          </button>
          <button className={tab === 'health' ? 'active' : ''} onClick={() => setTab('health')}>
            Parser Health
            {state.issues.length > 0 && <span className="badge">{state.issues.length}</span>}
          </button>
        </nav>
      </header>
      {state.cachedBanner && <p className="banner">showing cached data</p>}
      {tab === 'overview' ? <Overview months={state.months} now={now} /> : <ParserHealth issues={state.issues} />}
    </div>
  )
}
