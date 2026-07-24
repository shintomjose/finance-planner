// Month-load orchestrator (Task 9): lists month tabs, resolves each tab's
// grids from cache or the network per the freshness policy below, parses
// every tab, and aggregates the results. Never throws for per-tab fetch or
// parse trouble — those become ParserIssue entries — EXCEPT AuthExpiredError,
// which always propagates so the UI can re-run the OAuth flow.
import { currentTabName } from '../lib/period'
import { parseMonth } from '../parse/month'
import type { MonthGrids } from '../parse/month'
import { getCached, putCached } from '../cache/db'
import { AuthExpiredError, TabNotFoundError } from '../api/sheets'
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

/** batchGet quota kindness: fetch at most this many tabs concurrently,
 * sequential between chunks. */
const CHUNK_SIZE = 5

/** Resolves one tab's grids from cache-or-network per the freshness policy.
 * Returns null (never throws) for a TabNotFoundError on the current-month
 * tab — the caller records 'missing-current-month' and skips it. Any other
 * error (AuthExpiredError included) propagates to the caller. */
async function resolveGrids(
  client: SheetsClient, tab: string, currentTab: string, now: Date
): Promise<MonthGrids | null> {
  const isLive = tab === currentTab
  const cached = await getCached(tab)
  if (cached) {
    if (!isLive) return cached.grids // immutable: any cache hit, never refetch
    const age = now.getTime() - cached.fetchedAt
    if (age <= LIVE_TTL_MS) return cached.grids
  }
  try {
    const grids = await client.fetchMonthGrids(tab)
    await putCached(tab, grids)
    return grids
  } catch (err) {
    if (isLive && err instanceof TabNotFoundError) return null
    throw err
  }
}

export async function loadMonths(client: SheetsClient, now: Date): Promise<LoadResult> {
  const tabs = await client.listMonthTabs()
  const currentTab = currentTabName(now)
  const issues: ParserIssue[] = []
  const gridsByTab = new Map<string, MonthGrids>()

  for (let i = 0; i < tabs.length; i += CHUNK_SIZE) {
    const chunk = tabs.slice(i, i + CHUNK_SIZE)
    const settled = await Promise.allSettled(chunk.map((tab) => resolveGrids(client, tab, currentTab, now)))
    for (let j = 0; j < chunk.length; j++) {
      const tab = chunk[j]
      const outcome = settled[j]
      if (outcome.status === 'fulfilled') {
        if (outcome.value) gridsByTab.set(tab, outcome.value)
        else issues.push({ sheet: tab, kind: 'missing-current-month', detail: `current-month tab "${tab}" not found in spreadsheet` })
      } else {
        const err = outcome.reason
        if (err instanceof AuthExpiredError) throw err // UI handles re-auth — never swallow
        const detail = err instanceof Error ? err.message : String(err)
        issues.push({ sheet: tab, kind: 'fetch-failed', detail })
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

  return { months, issues }
}
