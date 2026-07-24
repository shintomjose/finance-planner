// Month-load orchestrator (Task 9): lists month tabs, resolves each tab's
// grids from cache or the network per the freshness policy below, parses
// every tab, and aggregates the results. Never throws for per-tab fetch or
// parse trouble — those become ParserIssue entries — EXCEPT AuthExpiredError,
// which always propagates so the UI can re-run the OAuth flow.
import { currentTabName } from '../lib/period'
import { parseMonth } from '../parse/month'
import type { MonthGrids } from '../parse/month'
import { getCached, putCached } from '../cache/db'
import { TabNotFoundError } from '../api/sheets'
import type { SheetsClient } from '../api/sheets'
import type { MonthData, ParserIssue } from '../types'

export interface LoadResult {
  months: MonthData[]
  issues: ParserIssue[]
}

/** Current-month tab is treated as "live": cached data older than this is
 * refetched. Every other tab is immutable once cached (any cache hit wins,
 * regardless of age) — historical month tabs never change once the month
 * has closed. */
export const LIVE_TTL_MS = 10 * 60 * 1000

/** batchGet quota kindness: group tabs needing a network fetch into batches
 * of at most this many, each batch costing exactly 2 HTTP requests via
 * SheetsClient.fetchManyMonthGrids (spanning every tab in the batch in one
 * values call + one formulas call), fetched sequentially between batches.
 * This replaces the old per-tab-concurrency chunking — at 91 tabs that was
 * up to ~182 requests against a 60 reads/min/user quota; batches of 15 cut
 * a full 91-tab cold load to ~14 requests. */
const BATCH_TABS = 15

/** Resolves one tab's grids from cache only (no network) per the freshness
 * policy: historical tabs are immutable (any cache hit wins), the
 * current-month tab is "live" and refetched once its cached copy exceeds
 * LIVE_TTL_MS. Returns null when the tab needs a network fetch. */
async function resolveCachedGrids(tab: string, currentTab: string, now: Date): Promise<MonthGrids | null> {
  const isLive = tab === currentTab
  const cached = await getCached(tab)
  if (!cached) return null
  if (!isLive) return cached.grids // immutable: any cache hit, never refetch
  const age = now.getTime() - cached.fetchedAt
  return age <= LIVE_TTL_MS ? cached.grids : null
}

export async function loadMonths(client: SheetsClient, now: Date): Promise<LoadResult> {
  const tabs = await client.listMonthTabs()
  const currentTab = currentTabName(now)
  const issues: ParserIssue[] = []
  const gridsByTab = new Map<string, MonthGrids>()
  const toFetch: string[] = []

  for (const tab of tabs) {
    const cached = await resolveCachedGrids(tab, currentTab, now)
    if (cached) gridsByTab.set(tab, cached)
    else toFetch.push(tab)
  }

  for (let i = 0; i < toFetch.length; i += BATCH_TABS) {
    const batch = toFetch.slice(i, i + BATCH_TABS)
    // AuthExpiredError propagates straight out of fetchManyMonthGrids —
    // never swallow it, the UI needs it to re-run the OAuth flow.
    const { grids, failures } = await client.fetchManyMonthGrids(batch)
    for (const [tab, grids_] of grids) {
      // Cache writes are best-effort and kept separate from the fetch
      // outcome: a full IndexedDB (or private-browsing block) must not be
      // reported as a 'fetch-failed' (which would drop the tab from
      // `months`) — the freshly fetched grid is already in hand and gets
      // parsed below regardless of whether the write-back succeeds.
      gridsByTab.set(tab, grids_)
      try {
        await putCached(tab, grids_)
      } catch (err) {
        issues.push({
          sheet: tab,
          kind: 'cache-error',
          detail: `failed to write cache: ${err instanceof Error ? err.message : String(err)}`,
        })
      }
    }
    for (const [tab, err] of failures) {
      if (tab === currentTab && err instanceof TabNotFoundError) {
        issues.push({ sheet: tab, kind: 'missing-current-month', detail: `current-month tab "${tab}" not found in spreadsheet` })
      } else {
        issues.push({ sheet: tab, kind: 'fetch-failed', detail: err.message })
      }
    }
  }

  const months: MonthData[] = []
  for (const tab of tabs) {
    const grids = gridsByTab.get(tab)
    if (!grids) continue // missing-current-month or fetch-failed — already recorded
    const monthData = parseMonth(tab, grids)
    months.push(monthData)
    issues.push(...monthData.issues) // aggregate convenience concat; issues also stay on monthData
  }

  // Tab listing order (spreadsheets.get) isn't guaranteed chronological —
  // sort so consumers (e.g. Overview's `.at(-1)` for "current month") can
  // rely on ascending (year, month) order.
  months.sort((a, b) => a.period.year - b.period.year || a.period.month - b.period.month)

  return { months, issues }
}
