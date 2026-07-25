// Reconciles the sheet's own "carryover" cell for each month tab against a
// carryover chain we compute independently from the tab's own income/expense
// transactions. Large drift usually means a manual edit on the sheet slipped
// a transaction, or the sheet's carryover formula reaches outside the row
// range our parser reads — this is the signal that surfaces "Parser Health"
// style drift warnings for months (Plan 2 Task 9+).
import type { MonthData } from '../types'
import { round2, sortByPeriod, sumAmounts } from './mathUtils'

export interface CarryoverDrift {
  tab: string
  computed: number
  sheet: number | null
  driftEUR: number | null
}

export function computeChain(months: MonthData[]): CarryoverDrift[] {
  const sorted = sortByPeriod(months)
  const result: CarryoverDrift[] = []
  let computed = 0
  for (let i = 0; i < sorted.length; i++) {
    const m = sorted[i]
    if (i === 0) {
      computed = m.carryover ?? 0
    } else {
      const prev = sorted[i - 1]
      computed = computed + sumAmounts(prev.income) - sumAmounts(prev.expenses)
    }
    computed = round2(computed)
    const sheet = m.carryover
    const driftEUR = sheet === null ? null : round2(sheet - computed)
    result.push({ tab: m.tab, computed, sheet, driftEUR })
  }
  return result
}
