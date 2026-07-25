// Budget vs Actual pure logic (Plan 2 Task 9). Matches each MONTHLY_PLAN
// budget row (Budget.category — free text, e.g. "Groceries") against the
// selected month's expenses by comparing `categorize(tx.normLabel,
// overrides)` (the category-map bucket, e.g. 'groceries') to
// `normLabel(budget.category)` — both sides normalized so a sheet category
// written as "Groceries", " groceries ", etc. all match the bucket name.
// A budget row whose category text doesn't correspond to any bucket simply
// nets 0 actual, same as any other zero-activity category.
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

  const byBucket = new Map<string, number>()
  for (const tx of month.expenses) {
    const bucket = categorize(tx.normLabel, overrides)
    byBucket.set(bucket, round2((byBucket.get(bucket) ?? 0) + (tx.amountEUR ?? 0)))
  }

  const pctOfMonth = pctOfMonthElapsed(month.period, now)
  const matchedBuckets = new Set<string>()

  const rows: CategoryPacing[] = budget.map((b) => {
    const key = normLabel(b.category)
    const actual = byBucket.get(key) ?? 0
    if (byBucket.has(key)) matchedBuckets.add(key)
    const pctOfBudget = b.plannedMonthly > 0 ? round2((actual / b.plannedMonthly) * 100) : actual > 0 ? Infinity : 0
    return { category: b.category, plannedMonthly: b.plannedMonthly, actual, pctOfBudget, pctOfMonth, over: pctOfBudget > 100 }
  })

  const unbudgeted = [...byBucket.entries()]
    .filter(([bucket, actual]) => actual > 0 && !matchedBuckets.has(bucket))
    .map(([category, actual]) => ({ category, actual }))
    .sort((a, b) => b.actual - a.actual || a.category.localeCompare(b.category))

  const planned = sumPlanned(budget)
  const actualTotal = round2([...byBucket.values()].reduce((sum, v) => sum + v, 0))
  const surplus = round2(planned - actualTotal)

  return { rows, unbudgeted, totals: { planned, actual: actualTotal, surplus, plannedSurplus } }
}
