import { describe, it, expect, beforeEach } from 'vitest'
import { loadState, saveState, exportJSON, importJSON, DEFAULT_STATE, _setStorage } from '../src/state/appState'
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
})
