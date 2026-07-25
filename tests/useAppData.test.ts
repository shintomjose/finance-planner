// TDD target: assembleAppData (src/data/useAppData.ts), the pure grids ->
// parsed-data-plus-issues mapper the Task 14 hook wraps. No React/DOM/auth
// involved — just LoadResult + SpecialTabsResult in, AssembledData out.
import { describe, expect, it } from 'vitest'
import { assembleAppData } from '../src/data/useAppData'
import type { SpecialTabsResult } from '../src/data/useAppData'
import type { LoadResult } from '../src/data/orchestrator'
import { parseMonth } from '../src/parse/month'
import { parseBinance } from '../src/parse/binance'
import { parseDeutscheBank } from '../src/parse/deutscheBank'
import { parseIndiaTrips } from '../src/parse/indiaTrips'
import { parseMonthlyPlan } from '../src/parse/monthlyPlan'
import { parseMutualFunds } from '../src/parse/mutualFunds'
import { parseSachin } from '../src/parse/sachin'
import type { SpecialGrids, SpecialTabKey } from '../src/data/specialTabs'
import type { MonthGrids } from '../src/parse/month'
import type { ParserIssue } from '../src/types'
import JAN_22 from './fixtures/JAN_22.json'
import MONTHLY_PLAN from './fixtures/MONTHLY_PLAN.json'
import MUTUAL_FUNDS from './fixtures/MUTUAL_FUNDS.json'
import DEUTSCHE_BANK from './fixtures/DEUTSCHE_BANK.json'
import BINANCE from './fixtures/BINANCE.json'
import SACHIN from './fixtures/SACHIN.json'
import INDIA_2023 from './fixtures/INDIA_2023.json'

const monthsResult: LoadResult = {
  months: [parseMonth('JAN_22', JAN_22 as MonthGrids), parseMonth('FEB_22', JAN_22 as MonthGrids)],
  issues: [{ sheet: 'MAR_22', kind: 'fetch-failed', detail: 'boom' }],
}

const ALL_GRIDS: Record<SpecialTabKey, SpecialGrids> = {
  MONTHLY_PLAN: MONTHLY_PLAN as SpecialGrids,
  MUTUAL_FUNDS: MUTUAL_FUNDS as SpecialGrids,
  DEUTSCHE_BANK: DEUTSCHE_BANK as SpecialGrids,
  BINANCE: BINANCE as SpecialGrids,
  SACHIN: SACHIN as SpecialGrids,
  INDIA_2023: INDIA_2023 as SpecialGrids,
}

function specialResult(keys: SpecialTabKey[], issues: ParserIssue[] = []): SpecialTabsResult {
  return { grids: new Map(keys.map((k) => [k, ALL_GRIDS[k]])), issues }
}

describe('assembleAppData', () => {
  it('all six grids present -> every parser invoked, all data non-null', () => {
    const result = assembleAppData(monthsResult, specialResult(Object.keys(ALL_GRIDS) as SpecialTabKey[]))
    expect(result.months).toBe(monthsResult.months) // passthrough, not re-parsed
    expect(result.plan).not.toBeNull()
    expect(result.mutualFunds).not.toBeNull()
    expect(result.deutscheBank).not.toBeNull()
    expect(result.binance).not.toBeNull()
    expect(result.sachin).not.toBeNull()
    expect(result.sachin).toEqual({ ledger: parseSachin(SACHIN as SpecialGrids).ledger })
    expect(result.trips).not.toBeNull()
  })

  it('issues = monthsResult.issues + specialResult.issues + every parser\'s own issues, in that order', () => {
    const fetchIssue: ParserIssue = { sheet: 'BINANCE', kind: 'fetch-failed', detail: 'network blip' }
    const result = assembleAppData(monthsResult, specialResult(Object.keys(ALL_GRIDS) as SpecialTabKey[], [fetchIssue]))

    const expectedTail = [
      ...parseMonthlyPlan(MONTHLY_PLAN as SpecialGrids).issues,
      ...parseMutualFunds(MUTUAL_FUNDS as SpecialGrids).issues,
      ...parseDeutscheBank(DEUTSCHE_BANK as SpecialGrids).issues,
      ...parseBinance(BINANCE as SpecialGrids).issues,
      ...parseSachin(SACHIN as SpecialGrids).issues,
      ...parseIndiaTrips(INDIA_2023 as SpecialGrids).issues,
    ]
    expect(result.issues).toEqual([...monthsResult.issues, fetchIssue, ...expectedTail])
  })

  it('a tab absent from grids (e.g. fetch failed for it) -> null prop, no crash, and no parser issues for it', () => {
    const keys = (Object.keys(ALL_GRIDS) as SpecialTabKey[]).filter((k) => k !== 'SACHIN')
    const fetchIssue: ParserIssue = { sheet: 'SACHIN', kind: 'fetch-failed', detail: 'no data returned' }
    const result = assembleAppData(monthsResult, specialResult(keys, [fetchIssue]))

    expect(result.sachin).toBeNull()
    expect(result.plan).not.toBeNull() // the other five still parsed fine
    expect(result.issues).toContainEqual(fetchIssue)
    // No SACHIN-sheet parser issues snuck in despite the tab being absent.
    expect(result.issues.filter((i) => i.sheet === 'SACHIN')).toEqual([fetchIssue])
  })

  it('every special tab absent -> every special prop null, issues is just months + special-fetch issues', () => {
    const result = assembleAppData(monthsResult, specialResult([]))
    expect(result.plan).toBeNull()
    expect(result.mutualFunds).toBeNull()
    expect(result.deutscheBank).toBeNull()
    expect(result.binance).toBeNull()
    expect(result.sachin).toBeNull()
    expect(result.trips).toBeNull()
    expect(result.issues).toEqual(monthsResult.issues)
  })
})
