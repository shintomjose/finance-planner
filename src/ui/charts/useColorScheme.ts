// Charts need real color values (recharts fills/strokes are SVG paint
// attributes, not something CSS `prefers-color-scheme` can swap on its
// own), so wrappers read the live OS scheme via matchMedia rather than
// hard-coding light. This app has no manual theme toggle (app.css is
// prefers-color-scheme only), so the media query is the single source of
// truth and this hook is the one place that watches it.
import { useEffect, useState } from 'react'
import type { ColorScheme } from './palette'

function readScheme(): ColorScheme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function useColorScheme(): ColorScheme {
  const [scheme, setScheme] = useState<ColorScheme>(readScheme)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e: MediaQueryListEvent) => setScheme(e.matches ? 'dark' : 'light')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return scheme
}
