import { describe, it, expect, beforeEach } from 'vitest'
import { loadState, saveState, exportJSON, importJSON, parseFxRateInput, DEFAULT_STATE, _setStorage } from '../src/state/appState'
import type { AppState } from '../src/state/appState'

function fakeStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v)
    },
  }
}

describe('appState', () => {
  beforeEach(() => {
    _setStorage(undefined)
  })

  it('loadState returns DEFAULT_STATE when no storage backend is available', () => {
    expect(loadState()).toEqual(DEFAULT_STATE)
  })

  it('loadState returns DEFAULT_STATE when the key is missing', () => {
    _setStorage(fakeStorage())
    expect(loadState()).toEqual(DEFAULT_STATE)
  })

  it('round-trips a full state through save/load', () => {
    const store = fakeStorage()
    _setStorage(store)
    const state: AppState = {
      categoryOverrides: { edeka: 'groceries' },
      fxRate: 92.5,
      goals: [{ id: 'g1', name: 'Car', targetEUR: 5000, targetDate: '2027-01-01', note: 'used car', currentEUR: 1200 }],
      recurringConfirmed: ['rent'],
    }
    saveState(state)
    expect(loadState()).toEqual(state)
  })

  it('corrupt JSON in storage falls back to DEFAULT_STATE', () => {
    const store = fakeStorage()
    store.setItem('fp-state-v1', '{not valid json')
    _setStorage(store)
    expect(loadState()).toEqual(DEFAULT_STATE)
  })

  it('valid JSON but wrong shape (array) falls back to DEFAULT_STATE', () => {
    const store = fakeStorage()
    store.setItem('fp-state-v1', '[1,2,3]')
    _setStorage(store)
    expect(loadState()).toEqual(DEFAULT_STATE)
  })

  it('saveState is a no-op when no storage backend is available', () => {
    expect(() => saveState(DEFAULT_STATE)).not.toThrow()
  })

  it('exportJSON produces pretty (indented) JSON that round-trips', () => {
    const json = exportJSON(DEFAULT_STATE)
    expect(json).toContain('\n')
    expect(JSON.parse(json)).toEqual(DEFAULT_STATE)
  })

  it('importJSON round-trips a valid export', () => {
    const state: AppState = { categoryOverrides: {}, fxRate: 80, goals: [], recurringConfirmed: [] }
    expect(importJSON(exportJSON(state))).toEqual(state)
  })

  it('importJSON throws on non-JSON garbage text', () => {
    expect(() => importJSON('not json at all')).toThrow()
  })

  it('importJSON throws on JSON that is not an object', () => {
    expect(() => importJSON('[1,2,3]')).toThrow()
    expect(() => importJSON('"just a string"')).toThrow()
    expect(() => importJSON('42')).toThrow()
    expect(() => importJSON('null')).toThrow()
  })

  it('importJSON drops unknown top-level keys and defaults missing ones', () => {
    const result = importJSON(JSON.stringify({ fxRate: 88, extraJunk: 'nope' }))
    expect(result).toEqual({ categoryOverrides: {}, fxRate: 88, goals: [], recurringConfirmed: [] })
  })

  it('importJSON drops malformed goal entries but keeps valid ones', () => {
    const result = importJSON(
      JSON.stringify({ goals: [{ id: 'g1', name: 'Car', targetEUR: 5000 }, { id: 'bad-missing-fields' }, 'not-an-object'] }),
    )
    expect(result.goals).toEqual([{ id: 'g1', name: 'Car', targetEUR: 5000 }])
  })

  it('importJSON ignores non-string values inside categoryOverrides', () => {
    const result = importJSON(JSON.stringify({ categoryOverrides: { edeka: 'groceries', bad: 5 } }))
    expect(result.categoryOverrides).toEqual({ edeka: 'groceries' })
  })

  it('importJSON drops non-string entries from recurringConfirmed', () => {
    const result = importJSON(JSON.stringify({ recurringConfirmed: ['rent', 5, null, 'gym'] }))
    expect(result.recurringConfirmed).toEqual(['rent', 'gym'])
  })

  // Locked behavior (reviewer, Plan 2 Task 7): a wrong-typed or non-finite
  // fxRate is silently ignored and defaults to 100 — importJSON does not
  // throw for this, only for a non-object payload.
  it('importJSON defaults fxRate to 100 when the value is wrong-typed', () => {
    const result = importJSON(JSON.stringify({ fxRate: 'abc' }))
    expect(result.fxRate).toBe(100)
  })

  it('importJSON defaults fxRate to 100 when the value is non-finite', () => {
    // JSON has no NaN literal (JSON.stringify(NaN) serializes to `null`,
    // which JSON.parse would hand back as `null`, not NaN), so the raw JSON
    // text is written by hand here rather than via JSON.stringify — a
    // numeric literal this large would also trip oxlint's
    // no-loss-of-precision rule if it appeared directly in source. Parsing
    // it overflows to Infinity, a real non-finite `number` that exercises
    // the same Number.isFinite guard NaN would hit.
    const result = importJSON('{"fxRate":1e1000}')
    expect(result.fxRate).toBe(100)
  })

  it('DEFAULT_STATE is frozen (including its nested collections) so it cannot be mutated in place', () => {
    expect(Object.isFrozen(DEFAULT_STATE)).toBe(true)
    expect(Object.isFrozen(DEFAULT_STATE.categoryOverrides)).toBe(true)
    expect(Object.isFrozen(DEFAULT_STATE.goals)).toBe(true)
    expect(Object.isFrozen(DEFAULT_STATE.recurringConfirmed)).toBe(true)
    expect(() => DEFAULT_STATE.goals.push({ id: 'x', name: 'x', targetEUR: 1 })).toThrow()
    // AppState.fxRate isn't typed readonly (so DEFAULT_STATE stays assignable
    // to plain AppState-typed variables) — the freeze is runtime-only, and
    // in ESM's implicit strict mode a write to a frozen property throws.
    expect(() => {
      DEFAULT_STATE.fxRate = 1
    }).toThrow()
  })

  // parseFxRateInput: shared validator for the Goals screen's fxRate editor
  // (Plan 2 pre-deploy fix) — a bad edit (blank, non-numeric, zero, negative)
  // must never silently commit garbage over a working fxRate, so the editor
  // needs a clean "valid or not" split it can act on.
  it('parseFxRateInput accepts a positive finite number string', () => {
    expect(parseFxRateInput('92.5')).toBe(92.5)
  })

  it('parseFxRateInput rejects zero', () => {
    expect(parseFxRateInput('0')).toBeNull()
  })

  it('parseFxRateInput rejects negative numbers', () => {
    expect(parseFxRateInput('-5')).toBeNull()
  })

  it('parseFxRateInput rejects non-numeric text', () => {
    expect(parseFxRateInput('abc')).toBeNull()
  })

  it('parseFxRateInput rejects blank input', () => {
    expect(parseFxRateInput('')).toBeNull()
    expect(parseFxRateInput('   ')).toBeNull()
  })

  it('parseFxRateInput rejects non-finite input (Infinity)', () => {
    expect(parseFxRateInput('Infinity')).toBeNull()
  })

  it('loadState/importJSON hand back independently mutable state, never the frozen DEFAULT_STATE reference', () => {
    const fromLoad = loadState()
    expect(fromLoad).not.toBe(DEFAULT_STATE)
    expect(() => fromLoad.goals.push({ id: 'x', name: 'x', targetEUR: 1 })).not.toThrow()

    const fromImport = importJSON('{}')
    expect(fromImport).not.toBe(DEFAULT_STATE)
    expect(() => fromImport.goals.push({ id: 'x', name: 'x', targetEUR: 1 })).not.toThrow()
  })
})
