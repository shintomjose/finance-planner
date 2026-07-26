import { beforeEach, describe, expect, it } from 'vitest'
import { loadThemeMode, saveThemeMode, resolveScheme, _setThemeStorage } from '../src/lib/theme'

function memStorage() {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
}

describe('theme mode persistence', () => {
  beforeEach(() => _setThemeStorage(memStorage()))

  it('defaults to system when nothing stored', () => {
    expect(loadThemeMode()).toBe('system')
  })

  it('round-trips an explicit mode', () => {
    saveThemeMode('dark')
    expect(loadThemeMode()).toBe('dark')
    saveThemeMode('light')
    expect(loadThemeMode()).toBe('light')
  })

  it('treats garbage in storage as system', () => {
    const s = memStorage()
    s.setItem('fp.theme', 'neon')
    _setThemeStorage(s)
    expect(loadThemeMode()).toBe('system')
  })

  it('survives missing storage (node env)', () => {
    _setThemeStorage(undefined)
    expect(loadThemeMode()).toBe('system')
    expect(() => saveThemeMode('dark')).not.toThrow()
  })
})

describe('resolveScheme', () => {
  it('explicit modes ignore the system flag', () => {
    expect(resolveScheme('dark', false)).toBe('dark')
    expect(resolveScheme('light', true)).toBe('light')
  })
  it('system follows the flag', () => {
    expect(resolveScheme('system', true)).toBe('dark')
    expect(resolveScheme('system', false)).toBe('light')
  })
})
