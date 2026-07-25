// Detects candidate recurring expenses from label history across months, so
// the UI can suggest "this looks recurring — confirm?" (Plan 2 Task 9+)
// without the user having to notice the pattern by hand.
import type { MonthData } from '../types'
import { categorize } from './normalize'

export interface RecurringCandidate {
  normLabel: string
  medianAmountEUR: number
  hitRate: number
  monthsSeen: number
  lastSeenTab: string
  cadence: 'monthly' | 'sporadic'
}

const round2 = (n: number): number => Math.round(n * 100) / 100

function sortByPeriod(months: MonthData[]): MonthData[] {
  return [...months].sort((a, b) => a.period.year - b.period.year || a.period.month - b.period.month)
}

function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!
}

interface Acc {
  amounts: number[]
  monthsSeen: number
  lastSeenTab: string
  lastPeriodKey: number
}

/** Over the trailing N months (default 12, latest by period), finds expense
 * labels that recur often enough to be worth tracking. A label seen in ≥6 of
 * the last 12 months (or ≥ half of `trailing` when trailing < 12) is
 * 'monthly'; ≥3 months is 'sporadic'; fewer is excluded entirely. Labels
 * categorized 'transfer' (e.g. "Last Month Balance") are never candidates —
 * they're carryover bookkeeping, not spending. */
export function detectRecurring(months: MonthData[], trailing = 12): RecurringCandidate[] {
  const sorted = sortByPeriod(months)
  const window = trailing >= sorted.length ? sorted : sorted.slice(sorted.length - trailing)
  const n = window.length
  const threshold = trailing < 12 ? trailing / 2 : 6

  const byLabel = new Map<string, Acc>()

  for (const m of window) {
    const periodKey = m.period.year * 12 + m.period.month
    const seenInMonth = new Set<string>()
    for (const tx of m.expenses) {
      if (categorize(tx.normLabel) === 'transfer') continue
      seenInMonth.add(tx.normLabel)
      const acc = byLabel.get(tx.normLabel) ?? { amounts: [], monthsSeen: 0, lastSeenTab: m.tab, lastPeriodKey: -Infinity }
      if (tx.amountEUR !== null) acc.amounts.push(tx.amountEUR)
      byLabel.set(tx.normLabel, acc)
    }
    for (const normLabel of seenInMonth) {
      const acc = byLabel.get(normLabel)!
      acc.monthsSeen += 1
      if (periodKey >= acc.lastPeriodKey) {
        acc.lastPeriodKey = periodKey
        acc.lastSeenTab = m.tab
      }
    }
  }

  const results: RecurringCandidate[] = []
  for (const [normLabel, acc] of byLabel) {
    let cadence: 'monthly' | 'sporadic'
    if (acc.monthsSeen >= threshold) cadence = 'monthly'
    else if (acc.monthsSeen >= 3) cadence = 'sporadic'
    else continue
    results.push({
      normLabel,
      medianAmountEUR: acc.amounts.length ? median(acc.amounts) : 0,
      hitRate: round2(acc.monthsSeen / n),
      monthsSeen: acc.monthsSeen,
      lastSeenTab: acc.lastSeenTab,
      cadence,
    })
  }
  results.sort((a, b) => b.monthsSeen - a.monthsSeen || a.normLabel.localeCompare(b.normLabel))
  return results
}
