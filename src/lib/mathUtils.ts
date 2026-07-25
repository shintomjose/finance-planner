// Tiny shared math/sort helpers used by both carryover.ts and trends.ts.
// Pulled out (reviewer finding, Plan 2 Task 10) to kill the hand-sync
// between the two modules — behavior is unchanged from carryover.ts's
// original private copies: sumAmounts does NOT round (callers round the
// result themselves, e.g. after accumulating across months), and
// sortByPeriod is the same defensive re-sort-by-period both modules rely on
// since callers pass MonthData[] already sorted but nothing here assumes it.
import type { MonthData, Tx } from '../types'

export const round2 = (n: number): number => Math.round(n * 100) / 100
export const round1 = (n: number): number => Math.round(n * 10) / 10

export function sortByPeriod(months: MonthData[]): MonthData[] {
  return [...months].sort((a, b) => a.period.year - b.period.year || a.period.month - b.period.month)
}

export function sumAmounts(txs: Tx[]): number {
  return txs.reduce((sum, t) => sum + (t.amountEUR ?? 0), 0)
}
