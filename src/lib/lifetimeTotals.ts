// Overview hero-band figures (spec 2026-07-27 §4): lifetime Salary + KG
// income across every month tab, and the owner's Monthly-AVG household
// formula. Pure aggregation — INR conversion happens at render time
// (totalEUR × appState.fxRate), not here, so a rate change never touches
// this lib.
import { round2 } from './mathUtils'
import type { MonthData } from '../types'

export interface LifetimeTotals {
  salaryEUR: number
  kgEUR: number
  /** salaryEUR + kgEUR — the owner's "Total income till now". */
  totalEUR: number
  monthCount: number
  /** Σ per-month household. Per month: the sheet's own summary Household
   * cell when present, else the sum of household-tagged expense rows (the
   * same formula-ref tagging parse/month.ts already does), else 0 — the
   * owner's formula divides by ALL months, so a month without household
   * data still counts in the denominator. */
  householdTotalEUR: number
  /** householdTotalEUR / monthCount; null when there are no months. */
  householdAvgEUR: number | null
}

const KG_LABELS = new Set(['kg', 'kindergeld'])

function householdOf(m: MonthData): number {
  if (m.summary.household != null) return m.summary.household
  return m.expenses.filter((tx) => tx.household).reduce((s, tx) => s + (tx.amountEUR ?? 0), 0)
}

export function lifetimeTotals(months: MonthData[]): LifetimeTotals {
  let salaryEUR = 0
  let kgEUR = 0
  let householdTotalEUR = 0
  for (const m of months) {
    for (const tx of m.income) {
      if (tx.normLabel === 'salary') salaryEUR += tx.amountEUR ?? 0
      else if (KG_LABELS.has(tx.normLabel)) kgEUR += tx.amountEUR ?? 0
    }
    householdTotalEUR += householdOf(m)
  }
  salaryEUR = round2(salaryEUR)
  kgEUR = round2(kgEUR)
  householdTotalEUR = round2(householdTotalEUR)
  const monthCount = months.length
  return {
    salaryEUR,
    kgEUR,
    totalEUR: round2(salaryEUR + kgEUR),
    monthCount,
    householdTotalEUR,
    householdAvgEUR: monthCount > 0 ? round2(householdTotalEUR / monthCount) : null,
  }
}
