// App data orchestration (Plan 2 Task 14): the final wiring layer sitting
// above orchestrator.ts (months) and specialTabs.ts (the six live special
// tabs) — parses every present special grid, aggregates every issue source
// (months + special-tab fetch + all six parsers) into one list, and owns
// the app-owned state (src/state/appState.ts) round-trip.
//
// Split in two per the design brief: `assembleAppData` is a pure function
// (grids -> parsed data + issues) so it's unit-testable without React, auth,
// or IndexedDB; `useAppData` is a thin hook that wraps it with the fetch/auth
// state machine App.tsx used to own directly (semantics unchanged — see the
// comment on AppDataState below) plus appState load/save.
import { useCallback, useEffect, useState } from 'react'
import { getToken, initAuth, signIn, silentReauth } from '../api/gis'
import { AuthExpiredError, SheetsClient } from '../api/sheets'
import { clearCache } from '../cache/db'
import { loadWithSilentReauth } from '../lib/authRetry'
import { parseBinance } from '../parse/binance'
import type { BinanceData } from '../parse/binance'
import { parseDeutscheBank } from '../parse/deutscheBank'
import type { DeutscheBankData } from '../parse/deutscheBank'
import { parseIndiaTrips } from '../parse/indiaTrips'
import { parseMonthlyPlan } from '../parse/monthlyPlan'
import type { MonthlyPlanData } from '../parse/monthlyPlan'
import { parseMutualFunds } from '../parse/mutualFunds'
import type { MutualFundsData } from '../parse/mutualFunds'
import { parseSachin } from '../parse/sachin'
import { loadState, saveState } from '../state/appState'
import type { AppState } from '../state/appState'
import type { MonthData, ParserIssue, PersonLedger, Trip } from '../types'
import { loadMonths } from './orchestrator'
import type { LoadResult } from './orchestrator'
import { loadSpecialTabs } from './specialTabs'
import type { SpecialGrids, SpecialTabKey } from './specialTabs'

/** Result of `loadSpecialTabs` — named here so `assembleAppData`'s signature
 * doesn't have to inline the shape. */
export interface SpecialTabsResult {
  grids: Map<SpecialTabKey, SpecialGrids>
  issues: ParserIssue[]
}

/** Everything a screen could need, already parsed and issue-aggregated.
 * Mirrors `ScreenProps` (src/ui/screens/registry.tsx) minus `now`/`label`,
 * which are request-time/nav concerns the hook doesn't own. A tab absent
 * from `grids` (fetch failure, or simply not yet cached) maps to `null` —
 * never a crash, never a silently-empty default — per SKILL.md parser rule
 * "parsers never crash and never silently drop". */
export interface AssembledData {
  months: MonthData[]
  plan: MonthlyPlanData | null
  mutualFunds: MutualFundsData | null
  deutscheBank: DeutscheBankData | null
  binance: BinanceData | null
  sachin: { ledger: PersonLedger } | null
  trips: Trip[] | null
  issues: ParserIssue[]
}

/** Pure: maps `loadSpecialTabs`'s grids (keyed by SpecialTabKey) through the
 * matching Task 3-6 parser, tolerating any subset of the six keys being
 * absent — a missing key just means `null` for that prop, its would-be
 * parser issues simply don't exist (never a placeholder issue). The
 * aggregate `issues` list is monthsResult.issues (which already carries
 * every month's own parse issues — see orchestrator.ts) concatenated with
 * specialResult.issues (special-tab *fetch* trouble) and then every parser's
 * own `issues` output, in that order — this is the single list ParserHealth
 * and the nav badge both consume. */
export function assembleAppData(monthsResult: LoadResult, specialResult: SpecialTabsResult): AssembledData {
  const { grids, issues: specialIssues } = specialResult
  const issues: ParserIssue[] = [...monthsResult.issues, ...specialIssues]

  let plan: MonthlyPlanData | null = null
  const planGrid = grids.get('MONTHLY_PLAN')
  if (planGrid) {
    plan = parseMonthlyPlan(planGrid)
    issues.push(...plan.issues)
  }

  let mutualFunds: MutualFundsData | null = null
  const mutualFundsGrid = grids.get('MUTUAL_FUNDS')
  if (mutualFundsGrid) {
    mutualFunds = parseMutualFunds(mutualFundsGrid)
    issues.push(...mutualFunds.issues)
  }

  let deutscheBank: DeutscheBankData | null = null
  const deutscheBankGrid = grids.get('DEUTSCHE_BANK')
  if (deutscheBankGrid) {
    deutscheBank = parseDeutscheBank(deutscheBankGrid)
    issues.push(...deutscheBank.issues)
  }

  let binance: BinanceData | null = null
  const binanceGrid = grids.get('BINANCE')
  if (binanceGrid) {
    binance = parseBinance(binanceGrid)
    issues.push(...binance.issues)
  }

  let sachin: { ledger: PersonLedger } | null = null
  const sachinGrid = grids.get('SACHIN')
  if (sachinGrid) {
    const parsed = parseSachin(sachinGrid)
    sachin = { ledger: parsed.ledger }
    issues.push(...parsed.issues)
  }

  let trips: Trip[] | null = null
  const tripsGrid = grids.get('INDIA_2023')
  if (tripsGrid) {
    const parsed = parseIndiaTrips(tripsGrid)
    trips = parsed.trips
    issues.push(...parsed.issues)
  }

  return { months: monthsResult.months, plan, mutualFunds, deutscheBank, binance, sachin, trips, issues }
}

/** Same shape/semantics as App.tsx's pre-Task-14 internal `AppState` type
 * (unauthenticated/loading/ready/error) — only the 'ready' payload changed,
 * from `{ months, issues }` to the fuller `AssembledData`. Zero-months and
 * auth-expiry routing are UNCHANGED: a load that yields zero months is still
 * 'error' (special tabs are never even fetched in that case — there's
 * nothing to show them alongside), and special-tab fetch trouble (including
 * a totally absent special tab) never blocks 'ready' — it only ever adds to
 * `issues`, exactly like a fetch-failed month tab does today. */
export type AppDataState =
  | { kind: 'unauthenticated'; note?: string }
  | { kind: 'loading' }
  | { kind: 'ready'; data: AssembledData }
  | { kind: 'error'; message: string }

export interface UseAppDataResult {
  state: AppDataState
  /** Re-run the full load. If there's no live token, this signs in
   * interactively instead (mirrors the old App.tsx `retry`). */
  retry: () => void
  /** Hard refresh: wipe the whole IndexedDB cache, then re-run the full
   * load so EVERY tab refetches — the only way sheet edits to historical
   * months (immutable in cache) or within-TTL live tabs become visible
   * without waiting. No live token -> interactive sign-in, like `retry`. */
  refresh: () => void
  appState: AppState
  onStateChange: (next: AppState) => void
}

/** `now` is passed in (not read internally) so App.tsx can keep owning the
 * single `now = new Date()` instant it already shares with
 * pickDisplayedMonth/banner — this hook doesn't need its own clock. */
export function useAppData(now: Date): UseAppDataResult {
  const [state, setState] = useState<AppDataState>({ kind: 'unauthenticated' })
  const [hasToken, setHasToken] = useState(false)
  // loadState() once, per the Task 14 brief — the lazy useState initializer
  // guarantees this runs exactly once for the component's lifetime, not on
  // every render.
  const [appState, setAppState] = useState<AppState>(() => loadState())

  useEffect(() => {
    initAuth(() => setHasToken(true))
  }, [])

  const load = useCallback(async () => {
    setState({ kind: 'loading' })
    const client = new SheetsClient(getToken)
    try {
      const outcome = await loadWithSilentReauth(
        async () => {
          const monthsResult = await loadMonths(client, now)
          // No months at all -> the whole load is going to end in 'error'
          // below regardless of what special tabs hold, so skip fetching
          // them entirely (same "don't do pointless work" reasoning as the
          // pre-Task-14 flow never touching special tabs at all).
          if (monthsResult.months.length === 0) return { monthsResult, specialResult: null }
          // Same client, same AuthExpiredError contract as loadMonths —
          // propagates straight out of loadSpecialTabs and up through this
          // run() callback to loadWithSilentReauth, exactly like a
          // loadMonths-thrown AuthExpiredError already does.
          const specialResult = await loadSpecialTabs(client, now)
          return { monthsResult, specialResult }
        },
        silentReauth,
        (err) => err instanceof AuthExpiredError,
      )
      if (outcome.status === 'unauthenticated') {
        setHasToken(false)
        setState({ kind: 'unauthenticated', note: 'Session expired — please sign in again.' })
        return
      }
      const { monthsResult, specialResult } = outcome.value
      if (monthsResult.months.length === 0 || !specialResult) {
        const detail = monthsResult.issues.map((i) => `${i.sheet}: ${i.detail}`).join('; ')
        setState({ kind: 'error', message: detail || 'No month data could be loaded.' })
        return
      }
      setState({ kind: 'ready', data: assembleAppData(monthsResult, specialResult) })
    } catch (err) {
      setState({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }, [now])

  useEffect(() => {
    if (hasToken) void load()
  }, [hasToken, load])

  const retry = useCallback(() => {
    if (getToken()) void load()
    else signIn()
  }, [load])

  const refresh = useCallback(() => {
    void (async () => {
      // Clear FIRST, even on the no-token path — the user pressed hard
      // refresh, so the load that follows the interactive sign-in must not
      // serve the stale cache either (reviewer, 2026-07-27). Best-effort: a
      // failed clear (private-browsing block, etc.) must not kill the
      // refresh — the load still refetches whatever the freshness policy
      // allows, which is strictly better than doing nothing.
      try {
        await clearCache()
      } catch {
        /* proceed with whatever cache state remains */
      }
      if (getToken()) await load()
      else signIn()
    })()
  }, [load])

  const onStateChange = useCallback((next: AppState) => {
    saveState(next)
    setAppState(next)
  }, [])

  return { state, retry, refresh, appState, onStateChange }
}
