// Food Home budget-tracker semantics (owner live-review clarification,
// 2026-07-26; see SKILL.md Parser rules and workbook-map.md §1.1 Upcoming
// row). The Upcoming block's "Food Home" row is NOT a payable bill — it's
// the monthly food-budget tracker: N (total) = the monthly budget (700),
// O (toPay) = the REMAINING budget for the rest of the month. Treating it
// like every other upcoming row would (a) double-count it into the to-pay
// bills total and (b) mislabel a budget-remaining figure as money owed.
// Any upcoming row whose label normalizes to 'food home' gets this
// treatment (same normalization rule as every other label match in the
// codebase — see src/lib/normalize.ts).
import type { MonthData, UpcomingItem } from '../types'
import { normLabel } from './normalize'

export const FOOD_HOME_LABEL = 'food home'

export interface UpcomingPartition {
  /** Every upcoming row EXCEPT the food-home tracker row — these are the
   * actual payable bills (to-pay list + its footer sum). */
  bills: UpcomingItem[]
  /** The food-home row's toPay (= remaining food budget this month), or
   * null when the month's upcoming block has no food-home row. */
  foodHomeRemaining: number | null
}

export function partitionUpcoming(upcoming: UpcomingItem[]): UpcomingPartition {
  const bills: UpcomingItem[] = []
  let foodHomeRemaining: number | null = null
  for (const u of upcoming) {
    if (normLabel(u.name) === FOOD_HOME_LABEL) {
      foodHomeRemaining = u.toPay
      continue
    }
    bills.push(u)
  }
  return { bills, foodHomeRemaining }
}

/** Budget screen live indicator (Change 2): the food-home budget row's
 * "remaining this month" figure, sourced from the SELECTED month's upcoming
 * block — not recomputed from expenses, since the sheet's own remaining
 * figure is the source of truth for the budget tracker. Null when no month
 * is selected or the month's upcoming block has no food-home row (either
 * not entered yet, or the era predates the upcoming block entirely). */
export function foodHomeRemainingFor(month: MonthData | undefined): number | null {
  if (!month) return null
  return partitionUpcoming(month.upcoming).foodHomeRemaining
}
