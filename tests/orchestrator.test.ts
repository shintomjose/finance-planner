import { it, expect, vi } from 'vitest'
import { loadMonths, LIVE_TTL_MS } from '../src/data/orchestrator'
import { putCached } from '../src/cache/db'
import { AuthExpiredError, TabNotFoundError } from '../src/api/sheets'
import JAN_22 from './fixtures/JAN_22.json'

const NOW = new Date(2022, 1, 15) // FEB_22 is current
function fakeClient(tabs: string[]) {
  return { listMonthTabs: async () => tabs, fetchMonthGrids: vi.fn(async () => JAN_22) } as any
}
it('historical tab served from cache without refetch', async () => {
  await putCached('JAN_22', JAN_22 as any)
  const c = fakeClient(['JAN_22'])
  await loadMonths(c, NOW)
  expect(c.fetchMonthGrids).not.toHaveBeenCalled()
})
it('uncached tab fetched then cached', async () => {
  const c = fakeClient(['MAR_21'])
  await loadMonths(c, NOW)
  expect(c.fetchMonthGrids).toHaveBeenCalledWith('MAR_21')
  const c2 = fakeClient(['MAR_21'])
  await loadMonths(c2, NOW)
  expect(c2.fetchMonthGrids).not.toHaveBeenCalled()
})
it('current month refetched when stale', async () => {
  await putCached('FEB_22', JAN_22 as any, NOW.getTime() - LIVE_TTL_MS - 1)
  const c = fakeClient(['FEB_22'])
  await loadMonths(c, NOW)
  expect(c.fetchMonthGrids).toHaveBeenCalledWith('FEB_22')
})
it('current month served from cache when fresh', async () => {
  await putCached('FEB_22', JAN_22 as any, NOW.getTime() - 1000)
  const c = fakeClient(['FEB_22'])
  await loadMonths(c, NOW)
  expect(c.fetchMonthGrids).not.toHaveBeenCalled()
})
it('parse errors collected, not thrown', async () => {
  const bad = { values: [], formulas: {} }
  const c = { listMonthTabs: async () => ['APR_20'], fetchMonthGrids: async () => bad } as any
  const r = await loadMonths(c, NOW)
  expect(r.months.length).toBe(1) // empty-but-present MonthData
})
it('AuthExpiredError propagates instead of being swallowed', async () => {
  const c = {
    listMonthTabs: async () => ['MAY_20'],
    fetchMonthGrids: async () => { throw new AuthExpiredError() },
  } as any
  await expect(loadMonths(c, NOW)).rejects.toBeInstanceOf(AuthExpiredError)
})
it('missing current-month tab (TabNotFoundError) is skipped with an issue, other tabs continue', async () => {
  // Force FEB_22 (the current tab) past any fresh cache left by earlier
  // tests so this run actually hits fetchMonthGrids and observes the throw.
  await putCached('FEB_22', JAN_22 as any, 0)
  const c = {
    listMonthTabs: async () => ['FEB_22', 'JUN_20'],
    fetchMonthGrids: vi.fn(async (tab: string) => {
      if (tab === 'FEB_22') throw new TabNotFoundError('FEB_22')
      return JAN_22
    }),
  } as any
  const r = await loadMonths(c, NOW)
  expect(r.months.map((m: any) => m.tab)).toEqual(['JUN_20'])
  expect(r.issues.some((i) => i.kind === 'missing-current-month' && i.sheet === 'FEB_22')).toBe(true)
})
it('non-auth fetch failure on a non-current tab records fetch-failed and continues', async () => {
  const c = {
    listMonthTabs: async () => ['JUL_20', 'AUG_20'],
    fetchMonthGrids: vi.fn(async (tab: string) => {
      if (tab === 'JUL_20') throw new Error('network blip')
      return JAN_22
    }),
  } as any
  const r = await loadMonths(c, NOW)
  expect(r.months.map((m: any) => m.tab)).toEqual(['AUG_20'])
  expect(r.issues.some((i) => i.kind === 'fetch-failed' && i.sheet === 'JUL_20')).toBe(true)
})
it('returns months sorted chronologically by period, not tab-listing order', async () => {
  const c = fakeClient(['MAR_21', 'JAN_22', 'FEB_21'])
  const r = await loadMonths(c, NOW)
  expect(r.months.map((m: any) => m.tab)).toEqual(['FEB_21', 'MAR_21', 'JAN_22'])
})
it('fetches in chunks of at most 5 concurrent requests', async () => {
  const tabs = ['SEP_18', 'OCT_18', 'NOV_18', 'DEC_18', 'JAN_19', 'FEB_19', 'MAR_19']
  let inFlight = 0
  let maxInFlight = 0
  const c = {
    listMonthTabs: async () => tabs,
    fetchMonthGrids: vi.fn(async () => {
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      await Promise.resolve()
      inFlight--
      return JAN_22
    }),
  } as any
  await loadMonths(c, NOW)
  expect(maxInFlight).toBeLessThanOrEqual(5)
  expect(c.fetchMonthGrids).toHaveBeenCalledTimes(7)
})
