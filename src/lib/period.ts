import type { Era, Period } from '../types'
const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']

export function tabToPeriod(tab: string): Period | null {
  const t = tab.trim().toUpperCase()
  const bare = MONTHS.indexOf(t)
  if (bare >= 0) return { year: 2019, month: bare + 1 }
  const m = /^([A-Z]{3})_(\d{2})$/.exec(t)
  if (!m) return null
  const mi = MONTHS.indexOf(m[1])
  if (mi < 0) return null
  return { year: 2000 + Number(m[2]), month: mi + 1 }
}
export const isMonthTab = (tab: string) => tabToPeriod(tab) !== null
export function eraOf(p: Period): Era {
  if (p.year === 2019) return p.month <= 5 ? '2019v1' : '2019v2'
  if (p.year < 2024 || (p.year === 2024 && p.month <= 10)) return 'full'
  return 'v2025'
}
export const currentTabName = (now: Date) =>
  `${MONTHS[now.getMonth()]}_${String(now.getFullYear() % 100).padStart(2, '0')}`
