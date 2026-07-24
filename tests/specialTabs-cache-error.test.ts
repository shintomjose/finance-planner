import { it, expect, vi } from 'vitest'

// Same pattern as tests/orchestrator-cache-error.test.ts: mock only
// putCached to reject (quota exceeded, private-browsing IDB disabled, etc.)
// while leaving getCached/CACHE_SCHEMA_VERSION as the real
// fake-indexeddb-backed implementation, so the cache-miss -> fetch path
// runs for real and only the write-back fails.
vi.mock('../src/cache/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/cache/db')>()
  return { ...actual, putCached: vi.fn(async () => { throw new Error('quota exceeded') }) }
})

import { loadSpecialTabs } from '../src/data/specialTabs'

const NOW = new Date(2022, 1, 15)

it('putCached failure is recorded as a cache-error issue (not fetch-failed), fetched grids still returned', async () => {
  const c = {
    fetchRanges: vi.fn(async (ranges: string[]) => ranges.map(() => [[1]])),
  } as any
  const r = await loadSpecialTabs(c, NOW)
  expect(r.grids.size).toBe(6) // fetched data still used this run despite the cache write failing
  expect(r.issues.length).toBe(6)
  expect(r.issues.every((i) => i.kind === 'cache-error')).toBe(true)
  expect(r.issues.some((i) => i.kind === 'fetch-failed')).toBe(false)
})
