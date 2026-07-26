// Charts need concrete color values (SVG paint attrs), so they read the
// app's resolved theme — the ThemeContext, not the OS — as the single
// source of truth. Falls back to 'dark' when rendered outside the
// provider (shouldn't happen in the app; main.tsx always wraps <App/>).
import { useContext } from 'react'
import { ThemeSchemeContext } from '../theme/ThemeContext'
import type { ColorScheme } from './palette'

export function useColorScheme(): ColorScheme {
  const scheme = useContext(ThemeSchemeContext)
  return scheme ?? 'dark'
}
