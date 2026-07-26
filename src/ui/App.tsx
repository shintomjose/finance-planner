// App shell (Task 10, rewired Task 14). Flow: mount -> initAuth (silent) ->
// token -> new SheetsClient(getToken) -> loadMonths -> loadSpecialTabs ->
// ready. No token -> SignIn screen. AuthExpiredError from either fetch -> one
// silent re-auth attempt (src/lib/authRetry.ts) and a single retry of the
// whole load; only if THAT still fails on auth -> back to SignIn with a
// "session expired" note. Fetch failures that still leave cached months
// (per-tab 'fetch-failed' issues but months.length > 0) -> ready + banner
// (scoped to the displayed tab only — src/lib/banner.ts) plus a small nav
// chip for any other tabs that failed. A load that yields zero months
// (fetch failed for everything, or a genuine hard error) -> error state with
// retry. Special-tab fetch/parse trouble NEVER blocks 'ready' — months alone
// are enough; a missing special tab just means its screen prop is null and
// its issues (if any) show up in Parser Health. All of this state-machine
// logic now lives in the useAppData hook (src/data/useAppData.ts) — this
// file only owns "which of the 9 screens is active" and rendering the
// resulting state.
import { useState } from 'react'
import { useAppData } from '../data/useAppData'
import { pickDisplayedMonth } from '../lib/period'
import { bannerFor } from '../lib/banner'
import { Layout, SCREEN_REGISTRY } from './Layout'
import type { ScreenId } from './Layout'
import { SignIn } from './SignIn'
import { LoadingState } from './shared'
import './app.css'

type Tab = ScreenId

// Stable for the lifetime of the page load: both the orchestrator's
// "which tab is current" check and Overview's fallback logic need to agree
// on the same instant, and there's no reason to recompute it on rerenders.
const now = new Date()

export default function App() {
  const [tab, setTab] = useState<Tab>('overview')
  // Which month tab the global header/month-pill row is showing — null
  // until the user picks one explicitly, at which point the effective
  // month below falls back to pickDisplayedMonth (current/latest). Not
  // persisted (brief: "Selection = App-level state (not persisted)").
  const [selectedTab, setSelectedTab] = useState<string | null>(null)
  const { state, retry, appState, onStateChange } = useAppData(now)

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

  // `state.data.months` is non-empty here (the hook routes zero-month
  // results to the 'error' state before ever reaching 'ready'), so
  // pickDisplayedMonth always returns a month — no fallback needed.
  const { months, issues, plan, mutualFunds, deutscheBank, binance, sachin, trips } = state.data
  const displayedTab = pickDisplayedMonth(months, now)!.tab
  const { bannerForDisplayedTab, otherFailedTabCount } = bannerFor(issues, displayedTab)
  // `months` is non-empty here, and pickDisplayedMonth always returns a
  // month for a non-empty array, so the fallback `!` is safe the same way
  // displayedTab's is above.
  const selectedMonth = months.find((m) => m.tab === selectedTab) ?? pickDisplayedMonth(months, now)!

  return (
    <Layout
      active={tab}
      onNavigate={setTab}
      issueCount={issues.length}
      months={months}
      selectedMonth={selectedMonth}
      onSelectMonth={setSelectedTab}
      banner={bannerForDisplayedTab ? <p className="banner">Showing cached data</p> : undefined}
      chip={
        otherFailedTabCount > 0 ? (
          <span className="chip" title="Some data failed to refresh — see Parser Health for details">
            {otherFailedTabCount} tab{otherFailedTabCount === 1 ? '' : 's'} failed to load
          </span>
        ) : undefined
      }
      screenProps={{
        months,
        issues,
        now,
        label: SCREEN_REGISTRY[tab].label,
        selectedMonth,
        plan,
        mutualFunds,
        deutscheBank,
        binance,
        sachin,
        trips,
        appState,
        onStateChange,
      }}
    />
  )
}
