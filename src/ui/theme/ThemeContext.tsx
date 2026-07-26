// Owns theme mode + resolution. matchMedia listener active only in system
// mode. applyScheme stamps <html data-theme> so CSS tokens flip; charts read
// the same resolved scheme through useTheme()/useColorScheme().
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { applyScheme, loadThemeMode, resolveScheme, saveThemeMode } from '../../lib/theme'
import type { ResolvedScheme, ThemeMode } from '../../lib/theme'

interface ThemeCtx { mode: ThemeMode; scheme: ResolvedScheme; setMode: (m: ThemeMode) => void }

const Ctx = createContext<ThemeCtx | null>(null)

// Raw resolved-scheme context, consumed by charts/useColorScheme.ts. Kept
// separate from Ctx (and exported) so charts/* can read the scheme without
// importing the full theme API and without an import cycle between
// ui/theme/ and ui/charts/.
export const ThemeSchemeContext = createContext<ResolvedScheme | null>(null)

function systemDark(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : false
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(loadThemeMode)
  const [sysDark, setSysDark] = useState(systemDark)

  useEffect(() => {
    if (mode !== 'system' || typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e: MediaQueryListEvent) => setSysDark(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [mode])

  const scheme = resolveScheme(mode, sysDark)
  useEffect(() => applyScheme(scheme), [scheme])

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m)
    saveThemeMode(m)
    if (m === 'system') setSysDark(systemDark())
  }, [])

  const value = useMemo(() => ({ mode, scheme, setMode }), [mode, scheme, setMode])
  return (
    <Ctx.Provider value={value}>
      <ThemeSchemeContext.Provider value={scheme}>{children}</ThemeSchemeContext.Provider>
    </Ctx.Provider>
  )
}

export function useTheme(): ThemeCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useTheme outside ThemeProvider')
  return ctx
}

const LABELS: { mode: ThemeMode; label: string; title: string }[] = [
  { mode: 'light', label: '☀', title: 'Light' },
  { mode: 'dark', label: '☾', title: 'Dark' },
  { mode: 'system', label: '⌂', title: 'Follow system' },
]

export function ThemeToggle() {
  const { mode, setMode } = useTheme()
  return (
    <div className="theme-toggle" role="group" aria-label="Theme">
      {LABELS.map((o) => (
        <button
          key={o.mode}
          type="button"
          title={o.title}
          aria-pressed={mode === o.mode}
          className={mode === o.mode ? 'theme-toggle-btn active' : 'theme-toggle-btn'}
          onClick={() => setMode(o.mode)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
