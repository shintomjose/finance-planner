import { it, expect, vi } from 'vitest'

// Mock only putCached to reject (quota exceeded, private-browsing IDB
// disabled, etc.) while leaving getCached/CACHE_SCHEMA_VERSION as the real
// fake-indexeddb-backed implementation, so the orchestrator's cache-miss ->
// fetch path runs for real and only the write back fails.
vi.mock('../src/cache/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/cache/db')>()
  return { ...actual, putCached: vi.fn(async () => { throw new Error('quota exceeded') }) }
})

import { loadMonths } from '../src/data/orchestrator'
import JAN_22 from './fixtures/JAN_22.json'

const NOW = new Date(2022, 1, 15)

it('putCached failure is recorded as a cache-error issue, but the fetched data is still parsed and returned', async () => {
  const c = {
    listMonthTabs: async () => ['MAR_21'],
    fetchManyMonthGrids: vi.fn(async (batch: string[]) => ({
      grids: new Map(batch.map((t) => [t, JAN_22 as any])),
      failures: new Map(),
    })),
  } as any
  const r = await loadMonths(c, NOW)
  // Data still used for parsing this run despite the cache write failing.
  expect(r.months.map((m: any) => m.tab)).toEqual(['MAR_21'])
  expect(r.issues.some((i) => i.kind === 'cache-error' && i.sheet === 'MAR_21')).toBe(true)
  // Must not be misreported as a fetch failure — the fetch itself succeeded.
  expect(r.issues.some((i) => i.kind === 'fetch-failed' && i.sheet === 'MAR_21')).toBe(false)
})
