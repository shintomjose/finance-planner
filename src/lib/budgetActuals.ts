// Budget vs Actual pure logic (Plan 2 Task 9). Matches MONTHLY_PLAN budget
// rows (Budget.category — free text) against the selected month's expenses
// with TWO-TIER matching (reviewer finding, Critical: the real sheet's
// budget rows are granular expense labels like "Rent"/"Vodafone", not
// coarse category-map buckets — confirmed against the repo's own
// MONTHLY_PLAN fixture, where 23/24 rows are this shape; bucket-only
// matching left every one of them at 0% actual and dumped all real spend
// into `unbudgeted`):
//
//  - Tier 1 (primary): a tx is matched straight to a budget row when
//    normLabel(budget.category) === tx.normLabel (e.g. a "Rent" row catches
//    a "Rent" tx directly). This is how most real sheet rows resolve.
//  - Tier 2 (fallback): for whatever txs tier 1 didn't consume, fall back
//    to the original bucket match — categorize(tx.normLabel, overrides)
//    compared to normLabel(budget.category) — so a budget row that IS
//    written as a bucket name (e.g. "Groceries") still catches every
//    grocery-store tx that isn't itself named "Groceries".
//
// A tx is consumed by at most one tier — tier 1 always wins — so nothing is
// ever double-counted between a granular row and a same-bucket row.
import type { Budget, MonthData } from '../types'
import { categorize, normLabel } from './normalize'

export interface CategoryPacing {
  category: string
  plannedMonthly: number
  actual: number
  pctOfBudget: number
  pctOfMonth: number
  over: boolean
}

export interface BudgetView {
  rows: CategoryPacing[]
  unbudgeted: { category: string; actual: number }[]
  totals: { planned: number; actual: number; surplus: number; plannedSurplus: number | null }
}

const round2 = (n: number): number => Math.round(n * 100) / 100

/** Last day-of-month for `month` (1-12) in `year` — relies on the standard
 * "day 0 of next month" JS Date trick (Date's own month arg is 0-indexed,
 * so passing a 1-indexed target month as that arg already means "next
 * month", and day 0 rolls back to the target month's last day). */
function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

/** Fraction of the month elapsed, as a percentage: 100 for a month strictly
 * before `now`'s month, 0 for a month strictly after it (nothing to pace
 * against yet), and day-of-month/days-in-month for the current month. */
function pctOfMonthElapsed(period: MonthData['period'], now: Date): number {
  const periodKey = period.year * 12 + period.month
  const nowKey = now.getFullYear() * 12 + (now.getMonth() + 1)
  if (periodKey < nowKey) return 100
  if (periodKey > nowKey) return 0
  return round2((now.getDate() / daysInMonth(now.getFullYear(), now.getMonth() + 1)) * 100)
}

function sumPlanned(budget: Budget[]): number {
  return round2(budget.reduce((sum, b) => sum + b.plannedMonthly, 0))
}

/** Builds the empty-month view: every budget row present with zero actual,
 * no unbudgeted spill, totals derived from the budget alone. Used both when
 * no month is selected/available and (implicitly, since it composes) as the
 * baseline the real computation extends. */
function emptyView(budget: Budget[], plannedSurplus: number | null): BudgetView {
  const planned = sumPlanned(budget)
  return {
    rows: budget.map((b) => ({
      category: b.category, plannedMonthly: b.plannedMonthly, actual: 0, pctOfBudget: 0, pctOfMonth: 0, over: false,
    })),
    unbudgeted: [],
    totals: { planned, actual: 0, surplus: planned, plannedSurplus },
  }
}

/**
 * Pairs MONTHLY_PLAN's budget rows with `month`'s categorized actual spend.
 * `plannedSurplus` is a straight passthrough (e.g. MonthlyPlanData's
 * budgetTotals.surplus) — this function never derives it, since it has no
 * visibility into planned income, only planned/actual expense.
 */
export function budgetActuals(
  month: MonthData | undefined,
  budget: Budget[],
  overrides: Record<string, string>,
  now: Date,
  plannedSurplus: number | null,
): BudgetView {
  if (!month) return emptyView(budget, plannedSurplus)

  const rowKeys = new Set(budget.map((b) => normLabel(b.category)))

  // Tier 1: consume every tx whose exact label matches a budget row's
  // category text. `consumed` tracks which expenses tier 2 must skip.
  const tier1ByKey = new Map<string, number>()
  const consumed = new Array<boolean>(month.expenses.length).fill(false)
  month.expenses.forEach((tx, i) => {
    if (!rowKeys.has(tx.normLabel)) return
    tier1ByKey.set(tx.normLabel, round2((tier1ByKey.get(tx.normLabel) ?? 0) + (tx.amountEUR ?? 0)))
    consumed[i] = true
  })

  // Tier 2: bucket-match whatever tier 1 left over.
  const byBucket = new Map<string, number>()
  month.expenses.forEach((tx, i) => {
    if (consumed[i]) return
    const bucket = categorize(tx.normLabel, overrides)
    byBucket.set(bucket, round2((byBucket.get(bucket) ?? 0) + (tx.amountEUR ?? 0)))
  })

  const pctOfMonth = pctOfMonthElapsed(month.period, now)
  const matchedBuckets = new Set<string>()

  const rows: CategoryPacing[] = budget.map((b) => {
    const key = normLabel(b.category)
    if (byBucket.has(key)) matchedBuckets.add(key)
    const actual = round2((tier1ByKey.get(key) ?? 0) + (byBucket.get(key) ?? 0))
    const pctOfBudget = b.plannedMonthly > 0 ? round2((actual / b.plannedMonthly) * 100) : actual > 0 ? Infinity : 0
    return { category: b.category, plannedMonthly: b.plannedMonthly, actual, pctOfBudget, pctOfMonth, over: pctOfBudget > 100 }
  })

  const unbudgeted = [...byBucket.entries()]
    .filter(([bucket, actual]) => actual > 0 && !matchedBuckets.has(bucket))
    .map(([category, actual]) => ({ category, actual }))
    .sort((a, b) => b.actual - a.actual || a.category.localeCompare(b.category))

  const planned = sumPlanned(budget)
  const actualTotal = round2(month.expenses.reduce((sum, tx) => sum + (tx.amountEUR ?? 0), 0))
  const surplus = round2(planned - actualTotal)

  return { rows, unbudgeted, totals: { planned, actual: actualTotal, surplus, plannedSurplus } }
}
