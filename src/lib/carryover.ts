// Reconciles the sheet's own "carryover" cell for each month tab against a
// carryover chain we compute independently from the tab's own income/expense
// transactions. Large drift usually means a manual edit on the sheet slipped
// a transaction, or the sheet's carryover formula reaches outside the row
// range our parser reads — this is the signal that surfaces "Parser Health"
// style drift warnings for months (Plan 2 Task 9+).
import type { MonthData, Tx } from '../types'

export interface CarryoverDrift {
  tab: string
  computed: number
  sheet: number | null
  driftEUR: number | null
}

const round2 = (n: number): number => Math.round(n * 100) / 100

function sortByPeriod(months: MonthData[]): MonthData[] {
  return [...months].sort((a, b) => a.period.year - b.period.year || a.period.month - b.period.month)
}

function sumAmounts(txs: Tx[]): number {
  return txs.reduce((sum, t) => sum + (t.amountEUR ?? 0), 0)
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
