import { it, expect, vi } from 'vitest'
import { loadMonths, LIVE_TTL_MS } from '../src/data/orchestrator'
import { putCached } from '../src/cache/db'
import { AuthExpiredError, TabNotFoundError } from '../src/api/sheets'
import JAN_22 from './fixtures/JAN_22.json'

const NOW = new Date(2022, 1, 15) // FEB_22 is current

/** Fake fetchManyMonthGrids: resolves every requested tab to JAN_22 (unless
 * overridden), tracked with vi.fn so call args/count are assertable — mirrors
 * the real batched contract { grids, failures }. */
function fakeClient(tabs: string[]) {
  return {
    listMonthTabs: async () => tabs,
    fetchManyMonthGrids: vi.fn(async (batch: string[]) => ({
      grids: new Map(batch.map((t) => [t, JAN_22 as any])),
      failures: new Map(),
    })),
  } as any
}

it('historical tab served from cache without refetch', async () => {
  await putCached('JAN_22', JAN_22 as any)
  const c = fakeClient(['JAN_22'])
  await loadMonths(c, NOW)
  expect(c.fetchManyMonthGrids).not.toHaveBeenCalled()
})
it('uncached tab fetched then cached', async () => {
  const c = fakeClient(['MAR_21'])
  await loadMonths(c, NOW)
  expect(c.fetchManyMonthGrids).toHaveBeenCalledWith(['MAR_21'])
  const c2 = fakeClient(['MAR_21'])
  await loadMonths(c2, NOW)
  expect(c2.fetchManyMonthGrids).not.toHaveBeenCalled()
})
it('current month refetched when stale', async () => {
  await putCached('FEB_22', JAN_22 as any, NOW.getTime() - LIVE_TTL_MS - 1)
  const c = fakeClient(['FEB_22'])
  await loadMonths(c, NOW)
  expect(c.fetchManyMonthGrids).toHaveBeenCalledWith(['FEB_22'])
})
it('current month served from cache when fresh', async () => {
  await putCached('FEB_22', JAN_22 as any, NOW.getTime() - 1000)
  const c = fakeClient(['FEB_22'])
  await loadMonths(c, NOW)
  expect(c.fetchManyMonthGrids).not.toHaveBeenCalled()
})
it('parse errors collected, not thrown', async () => {
  const bad = { values: [], formulas: {} }
  const c = {
    listMonthTabs: async () => ['APR_20'],
    fetchManyMonthGrids: async (batch: string[]) => ({
      grids: new Map(batch.map((t) => [t, bad as any])),
      failures: new Map(),
    }),
  } as any
  const r = await loadMonths(c, NOW)
  expect(r.months.length).toBe(1) // empty-but-present MonthData
})
it('AuthExpiredError propagates instead of being swallowed', async () => {
  const c = {
    listMonthTabs: async () => ['MAY_20'],
    fetchManyMonthGrids: async () => { throw new AuthExpiredError() },
  } as any
  await expect(loadMonths(c, NOW)).rejects.toBeInstanceOf(AuthExpiredError)
})
it('missing current-month tab (TabNotFoundError) is skipped with an issue, other tabs continue', async () => {
  // Force FEB_22 (the current tab) past any fresh cache left by earlier
  // tests so this run actually hits fetchManyMonthGrids and observes the failure.
  await putCached('FEB_22', JAN_22 as any, 0)
  const c = {
    listMonthTabs: async () => ['FEB_22', 'JUN_20'],
    fetchManyMonthGrids: vi.fn(async (batch: string[]) => {
      const grids = new Map<string, any>()
      const failures = new Map<string, Error>()
      for (const tab of batch) {
        if (tab === 'FEB_22') failures.set(tab, new TabNotFoundError(tab))
        else grids.set(tab, JAN_22)
      }
      return { grids, failures }
    }),
  } as any
  const r = await loadMonths(c, NOW)
  expect(r.months.map((m: any) => m.tab)).toEqual(['JUN_20'])
  expect(r.issues.some((i) => i.kind === 'missing-current-month' && i.sheet === 'FEB_22')).toBe(true)
})
it('non-auth fetch failure on a non-current tab records fetch-failed and continues', async () => {
  const c = {
    listMonthTabs: async () => ['JUL_20', 'AUG_20'],
    fetchManyMonthGrids: vi.fn(async (batch: string[]) => {
      const grids = new Map<string, any>()
      const failures = new Map<string, Error>()
      for (const tab of batch) {
        if (tab === 'JUL_20') failures.set(tab, new Error('network blip'))
        else grids.set(tab, JAN_22)
      }
      return { grids, failures }
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
it('20 tabs to fetch → exactly 2 batch calls of at most 15 tabs each (15 + 5)', async () => {
  const tabs = Array.from({ length: 20 }, (_, i) => `T${i}_18`)
  const c = fakeClient(tabs)
  await loadMonths(c, NOW)
  expect(c.fetchManyMonthGrids).toHaveBeenCalledTimes(2)
  const sizes = c.fetchManyMonthGrids.mock.calls.map((call: [string[]]) => call[0].length)
  expect(sizes).toEqual([15, 5])
})
it('mixed batch: one tab fails while the rest succeed — others still parsed+cached, failed tab gets an issue', async () => {
  const c = {
    listMonthTabs: async () => ['SEP_18', 'OCT_18', 'NOV_18'],
    fetchManyMonthGrids: vi.fn(async (batch: string[]) => {
      const grids = new Map<string, any>()
      const failures = new Map<string, Error>()
      for (const tab of batch) {
        if (tab === 'OCT_18') failures.set(tab, new Error('boom'))
        else grids.set(tab, JAN_22)
      }
      return { grids, failures }
    }),
  } as any
  const r = await loadMonths(c, NOW)
  expect(r.months.map((m: any) => m.tab).sort()).toEqual(['NOV_18', 'SEP_18'])
  expect(r.issues.some((i) => i.kind === 'fetch-failed' && i.sheet === 'OCT_18')).toBe(true)

  // Successful tabs from the mixed batch were cached — reloading refetches
  // nothing (aside from OCT_18, which failed and was never cached).
  const c2 = {
    listMonthTabs: async () => ['SEP_18', 'NOV_18'],
    fetchManyMonthGrids: vi.fn(async (batch: string[]) => ({
      grids: new Map(batch.map((t) => [t, JAN_22 as any])),
      failures: new Map(),
    })),
  } as any
  await loadMonths(c2, NOW)
  expect(c2.fetchManyMonthGrids).not.toHaveBeenCalled()
})
