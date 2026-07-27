// User-editable app state (category overrides, FX rate, savings goals,
// recurring-expense confirmations) — persisted to localStorage under a
// versioned key so a future shape change can migrate instead of colliding.
//
// Tests run under vitest's default 'node' environment, which has no
// `localStorage` global. Rather than pull in jsdom/happy-dom as a new dep,
// `_setStorage` is a tiny test seam: tests inject a Map-backed stub, and
// production code (browser) uses the real global when present.

export interface Goal {
  id: string
  name: string
  targetEUR: number
  targetDate?: string
  note?: string
  currentEUR?: number
}

export interface AppState {
  categoryOverrides: Record<string, string> // normLabel -> category
  fxRate: number // ₹ per €, default 92 (owner, 2026-07-27)
  goals: Goal[]
  recurringConfirmed: string[] // normLabels confirmed as recurring
}

/** Freezes `obj` and (one level down) every object/array-valued property, so
 * a caller can't accidentally mutate a shared constant through a nested
 * reference (e.g. `DEFAULT_STATE.goals.push(...)`). Shallow-plus-one is
 * enough here: AppState's own nested values (categoryOverrides, goals,
 * recurringConfirmed) are never more than one level deep. Returns `obj` with
 * its original static type — Object.freeze's own typing returns
 * Readonly<T>/ReadonlyArray<T>, which isn't assignable back to the mutable
 * AppState shape callers expect. */
function deepFreeze<T>(obj: T): T {
  Object.freeze(obj)
  if (obj && typeof obj === 'object') {
    for (const v of Object.values(obj as Record<string, unknown>)) {
      if (v && typeof v === 'object') Object.freeze(v)
    }
  }
  return obj
}

// Frozen so it's safe to hand out as a shared reference (e.g. `loadState()`
// comparisons, tests): nothing can silently mutate it. Every code path that
// needs a *mutable* default state goes through `freshDefault()` below
// instead, which builds independent objects — never derived from this one.
export const DEFAULT_STATE: AppState = deepFreeze<AppState>({
  categoryOverrides: {},
  fxRate: 92,
  goals: [],
  recurringConfirmed: [],
})

function freshDefault(): AppState {
  return { categoryOverrides: {}, fxRate: 92, goals: [], recurringConfirmed: [] }
}

const STORAGE_KEY = 'fp-state-v1'

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

let storage: StorageLike | undefined =
  typeof localStorage !== 'undefined' ? localStorage : undefined

/** Test seam: inject (or clear, via `undefined`) the storage backend. */
export function _setStorage(s: StorageLike | undefined): void {
  storage = s
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function sanitizeGoal(raw: unknown): Goal | null {
  if (!isPlainObject(raw)) return null
  const { id, name, targetEUR, targetDate, note, currentEUR } = raw
  if (typeof id !== 'string' || typeof name !== 'string' || typeof targetEUR !== 'number') return null
  const goal: Goal = { id, name, targetEUR }
  if (typeof targetDate === 'string') goal.targetDate = targetDate
  if (typeof note === 'string') goal.note = note
  if (typeof currentEUR === 'number') goal.currentEUR = currentEUR
  return goal
}

/** Validates and coerces an arbitrary parsed value into a well-formed
 * AppState: unknown top-level keys are dropped, missing keys are defaulted,
 * malformed goal entries are dropped individually. Throws only when `raw`
 * itself isn't a plain object (i.e. garbage, not just an incomplete state). */
function sanitizeState(raw: unknown): AppState {
  if (!isPlainObject(raw)) throw new Error('app state must be a JSON object')
  const out = freshDefault()
  const { categoryOverrides, fxRate, goals, recurringConfirmed } = raw
  if (isPlainObject(categoryOverrides)) {
    for (const [k, v] of Object.entries(categoryOverrides)) {
      if (typeof v === 'string') out.categoryOverrides[k] = v
    }
  }
  if (typeof fxRate === 'number' && Number.isFinite(fxRate)) out.fxRate = fxRate
  if (Array.isArray(goals)) {
    out.goals = goals.map(sanitizeGoal).filter((g): g is Goal => g !== null)
  }
  if (Array.isArray(recurringConfirmed)) {
    out.recurringConfirmed = recurringConfirmed.filter((s): s is string => typeof s === 'string')
  }
  return out
}

export function loadState(): AppState {
  if (!storage) return freshDefault()
  const raw = storage.getItem(STORAGE_KEY)
  if (!raw) return freshDefault()
  try {
    return sanitizeState(JSON.parse(raw))
  } catch {
    return freshDefault()
  }
}

export function saveState(s: AppState): void {
  storage?.setItem(STORAGE_KEY, JSON.stringify(s))
}

export function exportJSON(s: AppState): string {
  return JSON.stringify(s, null, 2)
}

/** Validates a raw string from the Goals screen's fxRate `<input>` (Plan 2
 * pre-deploy fix): only a positive, finite number is a valid ₹-per-€ rate —
 * blank, non-numeric, zero, negative, or Infinity all mean "don't touch the
 * existing rate", so the caller can tell "commit" from "keep previous +
 * show an inline note" with one check. */
export function parseFxRateInput(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const n = Number(trimmed)
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

export function importJSON(text: string): AppState {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (e) {
    throw new Error(`importJSON: invalid JSON — ${(e as Error).message}`)
  }
  return sanitizeState(parsed)
}
