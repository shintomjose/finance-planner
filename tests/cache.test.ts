import { it, expect } from 'vitest'
import { clearCache, getCached, putCached, CACHE_SCHEMA_VERSION } from '../src/cache/db'
import type { MonthGrids } from '../src/parse/month'

const grids: MonthGrids = { values: [[1, 2]], formulas: { B3: '=A1' } }

it('round-trips the current schema version', async () => {
  await putCached('CACHE_TEST_CURRENT', grids)
  const cached = await getCached('CACHE_TEST_CURRENT')
  expect(cached).not.toBeNull()
  expect(cached!.schemaVersion).toBe(CACHE_SCHEMA_VERSION)
  expect(cached!.grids).toEqual(grids)
})

it('stale schema version is treated as a cache miss', async () => {
  await putCached('CACHE_TEST_STALE', grids, Date.now(), CACHE_SCHEMA_VERSION - 1)
  const cached = await getCached('CACHE_TEST_STALE')
  expect(cached).toBeNull()
})

it('clearCache wipes every entry, month and special alike', async () => {
  await putCached('CACHE_TEST_CLEAR_MONTH', grids)
  await putCached('special:CACHE_TEST_CLEAR', grids)
  await clearCache()
  expect(await getCached('CACHE_TEST_CLEAR_MONTH')).toBeNull()
  expect(await getCached('special:CACHE_TEST_CLEAR')).toBeNull()
})
