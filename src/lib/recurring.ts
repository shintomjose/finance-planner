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
 * the last 12 months (or ≥ half of `trailing`, scaled, when trailing < 12) is
 * 'monthly'; ≥3 months (or ≥ a quarter of `trailing`, scaled, floored at 3)
 * is 'sporadic'; fewer is excluded entirely.
 *
 * Both tiers scale with `trailing` — review fix: scaling only the monthly
 * threshold let it collapse onto the (fixed) sporadic minimum for
 * trailing ≤ 6, making 'sporadic' unreachable (any count that qualified for
 * sporadic also cleared the equal-or-lower monthly bar first). The sporadic
 * threshold is floored at 3 (matching the original fixed minimum — you need
 * at least 3 hits to call anything a pattern, no matter how short the
 * window), and if the two thresholds would still collide, monthly is bumped
 * to sporadicThreshold + 1 so there's always a real gap between the tiers. */
export function detectRecurring(months: MonthData[], trailing = 12): RecurringCandidate[] {
  const sorted = sortByPeriod(months)
  const window = trailing >= sorted.length ? sorted : sorted.slice(sorted.length - trailing)
  const n = window.length
  const sporadicThreshold = Math.max(3, Math.ceil((trailing * 3) / 12))
  let monthlyThreshold = Math.ceil((trailing * 6) / 12)
  if (monthlyThreshold <= sporadicThreshold) monthlyThreshold = sporadicThreshold + 1

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
    if (acc.monthsSeen >= monthlyThreshold) cadence = 'monthly'
    else if (acc.monthsSeen >= sporadicThreshold) cadence = 'sporadic'
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
