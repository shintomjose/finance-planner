// Theme mode (user choice) vs resolved scheme (what's on screen): 'system'
// resolves via matchMedia at the call site so this module stays pure enough
// for node-env tests. Storage seam mirrors src/state/appState.ts.
export type ThemeMode = 'light' | 'dark' | 'system'
export type ResolvedScheme = 'light' | 'dark'

const KEY = 'fp.theme'
const MODES: readonly ThemeMode[] = ['light', 'dark', 'system']

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>
let storage: StorageLike | undefined = typeof localStorage !== 'undefined' ? localStorage : undefined

export function _setThemeStorage(s: StorageLike | undefined): void {
  storage = s
}

export function loadThemeMode(): ThemeMode {
  const raw = storage?.getItem(KEY)
  // Owner preference (2026-07-31): light is the default until a mode is
  // explicitly chosen — 'system' would flip dark on OS dark mode.
  return (MODES as readonly string[]).includes(raw ?? '') ? (raw as ThemeMode) : 'light'
}

export function saveThemeMode(mode: ThemeMode): void {
  storage?.setItem(KEY, mode)
}

export function resolveScheme(mode: ThemeMode, systemDark: boolean): ResolvedScheme {
  if (mode === 'system') return systemDark ? 'dark' : 'light'
  return mode
}

export function applyScheme(scheme: ResolvedScheme): void {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = scheme
}
