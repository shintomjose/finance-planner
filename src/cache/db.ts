// Raw IndexedDB cache for parsed month grids (Task 9). No idb lib — a single
// db `finance-planner` v1 with one objectStore `grids`, keyed by tab name.
// Historical (non-current-month) tabs are immutable once cached (see
// data/orchestrator.ts); this module only knows how to get/put, the
// freshness policy lives in the orchestrator.
import type { MonthGrids } from '../parse/month'

const DB_NAME = 'finance-planner'
const DB_VERSION = 1
const STORE_NAME = 'grids'

/** Bumped whenever the shape of `CachedGrids`/`MonthGrids` changes in a way
 * that makes previously-cached entries unsafe to reuse as-is. `getCached`
 * treats any entry whose `schemaVersion` doesn't match this as a cache miss
 * (not a crash) so a version bump just costs a refetch, never breaks the app.
 *
 * Bumped 1 -> 2 in Plan 2 Task 2: the `grids` store now also holds
 * `SpecialGrids` entries (src/data/specialTabs.ts, keyed `special:<KEY>`)
 * alongside `MonthGrids` entries — no shape change to `MonthGrids` itself,
 * but the bump is deliberate insurance so a `special:*` entry can never be
 * misread as a month grid (or vice versa) by an old/new code mismatch.
 * Side effect: every existing v1 `MonthGrids` entry (historical + current
 * month) becomes a one-time cache miss too and gets refetched on next load —
 * acceptable, no migration needed. */
export const CACHE_SCHEMA_VERSION = 2

/** `T` defaults to `MonthGrids` (the original/most common payload) so every
 * pre-Task-2 call site keeps compiling unchanged; `specialTabs.ts` passes
 * `SpecialGrids` explicitly. The store itself is untyped (IndexedDB doesn't
 * care), so this is purely a compile-time convenience — callers are
 * responsible for using a key namespace (`special:<KEY>` vs a bare tab name)
 * that keeps the two payload shapes from colliding under the same key. */
export interface CachedGrids<T = MonthGrids> {
  schemaVersion: number
  fetchedAt: number
  grids: T
}

let dbPromise: Promise<IDBDatabase> | null = null

/** Opens (or reuses) the shared db connection, creating the `grids` store on
 * first run. Connection is kept open for the app's lifetime — callers never
 * close it, avoiding open/close churn on every get/put. */
function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME)
        }
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
  return dbPromise
}

/** Reads the cached entry for `tab`, or null if never cached OR the entry
 * was written under a different `CACHE_SCHEMA_VERSION` — a version mismatch
 * is a cache miss, not a stale-but-usable hit, since older entries may not
 * match the current `MonthGrids` shape. */
export async function getCached<T = MonthGrids>(tab: string): Promise<CachedGrids<T> | null> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const req = tx.objectStore(STORE_NAME).get(tab)
    req.onsuccess = () => {
      const entry = (req.result as CachedGrids<T> | undefined) ?? null
      resolve(entry && entry.schemaVersion === CACHE_SCHEMA_VERSION ? entry : null)
    }
    req.onerror = () => reject(req.error)
  })
}

/** Writes `grids` for `tab`, overwriting any previous entry. `fetchedAt`
 * defaults to Date.now() but is exposed as a param so tests can backdate
 * entries (staleness tests in tests/orchestrator.test.ts). `schemaVersion`
 * defaults to the current version but is exposed as a param so tests can
 * write a stale-version entry directly (see tests/cache.test.ts) without a
 * separate write path. */
export async function putCached<T = MonthGrids>(
  tab: string,
  grids: T,
  fetchedAt: number = Date.now(),
  schemaVersion: number = CACHE_SCHEMA_VERSION,
): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const entry: CachedGrids<T> = { schemaVersion, fetchedAt, grids }
    tx.objectStore(STORE_NAME).put(entry, tab)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}
