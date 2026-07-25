// Goals screen pure logic (Plan 2 Task 13): savings-goal feasibility against
// trailing free cash flow, and a ranked list of still-uncategorized labels
// for the category-map editor. Reuses monthlyTotals() (trends.ts) for
// income/expense/net and categorize() (normalize.ts) for the uncategorized
// bucket — no new month-aggregation logic duplicated here.
import { round1, round2 } from './mathUtils'
import { categorize } from './normalize'
import { monthlyTotals } from './trends'
import type { Goal } from '../state/appState'
import type { MonthData } from '../types'

export interface GoalFeasibility {
  goalId: string
  monthsRemaining: number | null
  requiredPerMonth: number | null
  avgFreeCashFlow: number
  feasible: boolean | null
  progressPct: number | null
}

/** Parses a `YYYY-MM-DD` (or `YYYY-MM-DDTHH:mm...`) date-only prefix by hand
 * instead of `new Date(string)` — the latter parses bare ISO date strings as
 * UTC midnight, which can silently shift by a day once read back through
 * local getters depending on the host timezone. Every field here (both the
 * parsed target and `now`) is compared as a local calendar date, so the
 * result is timezone-independent. Returns null for anything that doesn't
 * match (malformed targetDate — treated the same as "no date"). */
function parseCalendarDate(s: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (!match) return null
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) }
}

/** Whole months remaining from `now` to `targetDate`'s calendar date,
 * ceil'd from the raw day count (so "3 weeks out" reads as 1 month
 * remaining, not 0) — can be zero or negative for a date already passed. */
function monthsRemainingFrom(now: Date, targetDate: string): number | null {
  const target = parseCalendarDate(targetDate)
  if (!target) return null
  const nowUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  const targetUTC = Date.UTC(target.y, target.m - 1, target.d)
  const days = (targetUTC - nowUTC) / 86_400_000
  return Math.ceil(days / 30)
}

/** avgFreeCashFlow = mean of monthlyTotals().net over the trailing
 * `trailingMonths` (default 6), excluding the month matching `now` (that
 * month is still partial and would understate/overstate a monthly average).
 * Feasibility per goal: requiredPerMonth = (targetEUR - currentEUR) /
 * monthsRemaining, only when there's a targetDate AND monthsRemaining > 0
 * (a missing date or an already-passed one leaves requiredPerMonth/feasible
 * both null — there's nothing to pace against). progressPct is always
 * computable (doesn't depend on a date) and clamped to [0, 100]. */
export function goalFeasibility(goals: Goal[], months: MonthData[], now: Date, trailingMonths = 6): GoalFeasibility[] {
  const totals = monthlyTotals(months)
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1
  const withoutCurrent = totals.filter((t) => !(t.year === currentYear && t.month === currentMonth))
  const window = withoutCurrent.slice(Math.max(0, withoutCurrent.length - trailingMonths))
  const avgFreeCashFlow = window.length > 0 ? round2(window.reduce((sum, t) => sum + t.net, 0) / window.length) : 0

  return goals.map((goal) => {
    const monthsRemaining = goal.targetDate ? monthsRemainingFrom(now, goal.targetDate) : null
    const requiredPerMonth =
      monthsRemaining != null && monthsRemaining > 0
        ? round2((goal.targetEUR - (goal.currentEUR ?? 0)) / monthsRemaining)
        : null
    const feasible = requiredPerMonth == null ? null : requiredPerMonth <= avgFreeCashFlow
    const progressRaw = goal.targetEUR > 0 ? ((goal.currentEUR ?? 0) / goal.targetEUR) * 100 : null
    const progressPct = progressRaw == null ? null : round1(Math.min(100, Math.max(0, progressRaw)))
    return { goalId: goal.id, monthsRemaining, requiredPerMonth, avgFreeCashFlow, feasible, progressPct }
  })
}

export interface UncategorizedRow {
  normLabel: string
  count: number
  totalEUR: number
}

/** Every expense whose categorize() bucket is 'uncategorized' (after
 * applying `overrides`), grouped by normLabel and ranked by hit count
 * descending (ties broken by totalEUR desc, then normLabel asc for a
 * stable order) — the category-map editor works down this list first since
 * a label seen often is worth an override more than a one-off. */
export function uncategorizedRanking(months: MonthData[], overrides: Record<string, string>, topN = 20): UncategorizedRow[] {
  const byLabel = new Map<string, { count: number; totalEUR: number }>()
  for (const m of months) {
    for (const tx of m.expenses) {
      if (categorize(tx.normLabel, overrides) !== 'uncategorized') continue
      const acc = byLabel.get(tx.normLabel) ?? { count: 0, totalEUR: 0 }
      acc.count += 1
      acc.totalEUR = round2(acc.totalEUR + (tx.amountEUR ?? 0))
      byLabel.set(tx.normLabel, acc)
    }
  }
  const result: UncategorizedRow[] = [...byLabel.entries()].map(([normLabel, v]) => ({ normLabel, ...v }))
  result.sort((a, b) => b.count - a.count || b.totalEUR - a.totalEUR || a.normLabel.localeCompare(b.normLabel))
  return result.slice(0, topN)
}
