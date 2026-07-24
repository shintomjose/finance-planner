// Raw IndexedDB cache for parsed month grids (Task 9). No idb lib — a single
// db `finance-planner` v1 with one objectStore `grids`, keyed by tab name.
// Historical (non-current-month) tabs are immutable once cached (see
// data/orchestrator.ts); this module only knows how to get/put, the
// freshness policy lives in the orchestrator.
import type { MonthGrids } from '../parse/month'

const DB_NAME = 'finance-planner'
const DB_VERSION = 1
const STORE_NAME = 'grids'

export interface CachedGrids {
  fetchedAt: number
  grids: MonthGrids
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

/** Reads the cached entry for `tab`, or null if never cached. */
export async function getCached(tab: string): Promise<CachedGrids | null> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const req = tx.objectStore(STORE_NAME).get(tab)
    req.onsuccess = () => resolve((req.result as CachedGrids | undefined) ?? null)
    req.onerror = () => reject(req.error)
  })
}

/** Writes `grids` for `tab`, overwriting any previous entry. `fetchedAt`
 * defaults to Date.now() but is exposed as a param so tests can backdate
 * entries (staleness tests in tests/orchestrator.test.ts). */
export async function putCached(tab: string, grids: MonthGrids, fetchedAt: number = Date.now()): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const entry: CachedGrids = { fetchedAt, grids }
    tx.objectStore(STORE_NAME).put(entry, tab)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}
