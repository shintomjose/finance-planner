// Special-tab fetch layer (Plan 2 Task 2): the six "live" non-month tabs
// (MONTHLY_PLAN, MUTUAL FUNDS, DEUTSCHE BANK, BINANCE, SACHIN, INDIA_2023)
// consumed by the Task 3–6 parsers. Mirrors orchestrator.ts's cache/TTL
// pattern but fetches all six ranges in a SINGLE SheetsClient.fetchRanges
// call instead of per-tab batching — there are only six of them, always
// fetched together, so one HTTP call beats even the month-tab batching
// scheme. Never throws for per-tab fetch trouble — those become
// ParserIssue entries — EXCEPT AuthExpiredError, which always propagates
// (same contract as loadMonths) so the UI can re-run the OAuth flow.
import { getCached, putCached } from '../cache/db'
import { LIVE_TTL_MS } from './orchestrator'
import type { SheetsClient } from '../api/sheets'
import type { ParserIssue } from '../types'

export const SPECIAL_TABS = {
  MONTHLY_PLAN: { range: 'MONTHLY_PLAN!A1:R170' },
  MUTUAL_FUNDS: { range: "'MUTUAL FUNDS'!A1:X45" },
  DEUTSCHE_BANK: { range: "'DEUTSCHE BANK'!A1:N95" },
  BINANCE: { range: 'BINANCE!A1:G30' },
  SACHIN: { range: 'SACHIN!A1:J340' },
  INDIA_2023: { range: 'INDIA_2023!A1:K300' },
} as const

export type SpecialTabKey = keyof typeof SPECIAL_TABS

export interface SpecialGrids { values: (string | number | null)[][] } // no formula grid needed

/** IndexedDB key namespace for special-tab entries — kept distinct from
 * bare month-tab keys (`orchestrator.ts` uses the tab name directly) so a
 * `special:*` entry can never collide with a same-named month tab. */
function cacheKey(key: SpecialTabKey): string {
  return `special:${key}`
}

/** All six special tabs are members of the "live" set (spec §3/SKILL.md
 * Cache row) — same staleness policy as the current-month tab in
 * orchestrator.ts: any cache hit within LIVE_TTL_MS wins, otherwise refetch. */
async function resolveCachedGrids(key: SpecialTabKey, now: Date): Promise<SpecialGrids | null> {
  const cached = await getCached<SpecialGrids>(cacheKey(key))
  if (!cached) return null
  const age = now.getTime() - cached.fetchedAt
  return age <= LIVE_TTL_MS ? cached.grids : null
}

export async function loadSpecialTabs(
  client: SheetsClient,
  now: Date,
): Promise<{ grids: Map<SpecialTabKey, SpecialGrids>; issues: ParserIssue[] }> {
  const keys = Object.keys(SPECIAL_TABS) as SpecialTabKey[]
  const issues: ParserIssue[] = []
  const gridsByKey = new Map<SpecialTabKey, SpecialGrids>()
  const toFetch: SpecialTabKey[] = []

  for (const key of keys) {
    const cached = await resolveCachedGrids(key, now)
    if (cached) gridsByKey.set(key, cached)
    else toFetch.push(key)
  }

  if (toFetch.length > 0) {
    const ranges = toFetch.map((key) => SPECIAL_TABS[key].range)
    // AuthExpiredError propagates straight out of fetchRanges — never
    // swallow it, the UI needs it to re-run the OAuth flow.
    const results = await client.fetchRanges(ranges)

    for (let i = 0; i < toFetch.length; i++) {
      const key = toFetch[i]
      const values = results[i]
      if (values === null) {
        // These tabs always exist in the workbook — a missing/empty
        // valueRange isn't a legitimately-empty tab, it's a fetch problem
        // for that one range. Record it and keep processing the rest
        // (partial failure never sinks the whole call).
        issues.push({
          sheet: key,
          kind: 'fetch-failed',
          detail: `no data returned for ${SPECIAL_TABS[key].range}`,
        })
        continue
      }
      const grid: SpecialGrids = { values }
      gridsByKey.set(key, grid)
      try {
        await putCached(cacheKey(key), grid)
      } catch (err) {
        issues.push({
          sheet: key,
          kind: 'cache-error',
          detail: `failed to write cache: ${err instanceof Error ? err.message : String(err)}`,
        })
      }
    }
  }

  return { grids: gridsByKey, issues }
}
