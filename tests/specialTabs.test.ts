import { it, expect, vi, beforeEach } from 'vitest'
import { loadSpecialTabs, SPECIAL_TABS } from '../src/data/specialTabs'
import type { SpecialTabKey } from '../src/data/specialTabs'
import { LIVE_TTL_MS } from '../src/data/orchestrator'
import { putCached, CACHE_SCHEMA_VERSION } from '../src/cache/db'
import { AuthExpiredError } from '../src/api/sheets'

const ALL_KEYS = Object.keys(SPECIAL_TABS) as SpecialTabKey[]
const ALL_RANGES = ALL_KEYS.map((k) => SPECIAL_TABS[k].range)

/** db.ts's cache is a shared IndexedDB store keyed by (namespaced) string,
 * and there's no exposed "clear" — so instead of relying on test order,
 * every test starts by force-invalidating all six `special:<KEY>` entries
 * (wrong schemaVersion is a guaranteed cache miss regardless of age/NOW,
 * see db.ts getCached). Tests that need a populated cache then explicitly
 * re-`putCached` with the current schema version, overwriting this seed. */
beforeEach(async () => {
  for (const key of ALL_KEYS) {
    await putCached(`special:${key}`, { values: [] }, 0, CACHE_SCHEMA_VERSION - 1)
  }
})

/** Fake SheetsClient.fetchRanges: resolves every requested range to a dummy
 * grid `[[1]]` by default, tracked with vi.fn so call args/count are
 * assertable — mirrors the real single-batchGet contract. */
function fakeClient() {
  return {
    fetchRanges: vi.fn(async (ranges: string[]) => ranges.map(() => [[1]])),
  } as any
}

it('cold cache: all six tabs fetched in exactly ONE fetchRanges call, with all six ranges in order', async () => {
  const c = fakeClient()
  const r = await loadSpecialTabs(c, new Date())
  expect(c.fetchRanges).toHaveBeenCalledTimes(1)
  expect(c.fetchRanges).toHaveBeenCalledWith(ALL_RANGES)
  expect(r.grids.size).toBe(6)
  expect(r.issues).toEqual([])
})

it('fresh cache entries served without any fetch', async () => {
  const now = new Date()
  for (const key of ALL_KEYS) {
    await putCached(`special:${key}`, { values: [[key]] }, now.getTime() - 1000)
  }
  const c = fakeClient()
  const r = await loadSpecialTabs(c, now)
  expect(c.fetchRanges).not.toHaveBeenCalled()
  expect(r.grids.size).toBe(6)
  expect(r.grids.get('SACHIN')).toEqual({ values: [['SACHIN']] })
})

it('stale cache entries (older than LIVE_TTL_MS) trigger a refetch', async () => {
  const now = new Date()
  for (const key of ALL_KEYS) {
    await putCached(`special:${key}`, { values: [[key]] }, now.getTime() - LIVE_TTL_MS - 1)
  }
  const c = fakeClient()
  await loadSpecialTabs(c, now)
  expect(c.fetchRanges).toHaveBeenCalledTimes(1)
  expect(c.fetchRanges).toHaveBeenCalledWith(ALL_RANGES)
})

it('v1-schema cache entries are invalidated (cache miss) and refetched even though fresh by timestamp', async () => {
  const now = new Date()
  for (const key of ALL_KEYS) {
    await putCached(`special:${key}`, { values: [[key]] }, now.getTime() - 1000, CACHE_SCHEMA_VERSION - 1)
  }
  const c = fakeClient()
  const r = await loadSpecialTabs(c, now)
  expect(c.fetchRanges).toHaveBeenCalledTimes(1)
  expect(r.grids.size).toBe(6)
})

it('uncached -> fetched and cached; reload (same clock) serves from cache with no fetch', async () => {
  const now = new Date()
  const c = fakeClient()
  await loadSpecialTabs(c, now)
  expect(c.fetchRanges).toHaveBeenCalledTimes(1)

  const c2 = fakeClient()
  await loadSpecialTabs(c2, now)
  expect(c2.fetchRanges).not.toHaveBeenCalled()
})

it('one null valueRange -> fetch-failed issue for that key only, others still resolve and get cached', async () => {
  const now = new Date()
  const c = {
    fetchRanges: vi.fn(async (ranges: string[]) =>
      ranges.map((r) => (r === SPECIAL_TABS.SACHIN.range ? null : [[1]])),
    ),
  } as any
  const r = await loadSpecialTabs(c, now)
  expect(r.grids.has('SACHIN')).toBe(false)
  expect(r.grids.size).toBe(5)
  expect(r.issues).toEqual([
    { sheet: 'SACHIN', kind: 'fetch-failed', detail: expect.stringContaining(SPECIAL_TABS.SACHIN.range) },
  ])

  // The other five WERE cached — a reload at (about) the same instant
  // fetches only the one that previously failed.
  const c2 = {
    fetchRanges: vi.fn(async (ranges: string[]) => ranges.map(() => [[2]])),
  } as any
  await loadSpecialTabs(c2, now)
  expect(c2.fetchRanges).toHaveBeenCalledWith([SPECIAL_TABS.SACHIN.range])
})

it('AuthExpiredError propagates instead of being swallowed into issues', async () => {
  const c = {
    fetchRanges: vi.fn(async () => { throw new AuthExpiredError() }),
  } as any
  await expect(loadSpecialTabs(c, new Date())).rejects.toBeInstanceOf(AuthExpiredError)
})
