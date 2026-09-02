// Overview hero-band figures (spec 2026-07-27 §4): lifetime Salary + KG
// income across every month tab, and the owner's Monthly-AVG household
// formula. Pure aggregation — INR conversion happens at render time
// (totalEUR × appState.fxRate), not here, so a rate change never touches
// this lib.
import { round2 } from './mathUtils'
import type { MonthData } from '../types'

export interface HouseholdExtreme {
  tab: string
  period: MonthData['period']
  amountEUR: number
}

export interface LifetimeTotals {
  salaryEUR: number
  /** KG/KinderGeld + EG/ElternGeld + ITR/Tax Return + EnBW (refund) income rows. */
  otherIncomeEUR: number
  /** salaryEUR + otherIncomeEUR — the owner's "Total income till now". */
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
  /** Trailing averages over the LAST 3 / 6 COMPLETED months by period
   * (owner 2026-07-31): the current calendar month is still in progress —
   * a half-filled month would drag the average down — so only months
   * strictly before it compete. Months without household data still count
   * in the denominator (same as the lifetime formula); the window shrinks
   * to however many completed months exist. Null when there are none. */
  householdAvg3EUR: number | null
  householdAvg6EUR: number | null
  /** Cheapest/most expensive household month (owner request 2026-07-27).
   * Only months with a POSITIVE household figure compete — a month with no
   * household data at all (0) would otherwise always "win" lowest, which
   * says nothing about spending. Null when no month qualifies. */
  householdLow: HouseholdExtreme | null
  householdHigh: HouseholdExtreme | null
}

// KG/EG abbreviations, their full German forms, ITR (India tax return —
// owner sometimes labels it "Tax Return"), and EnBW (electricity refund rows
// that land in income[], distinct from the EnBW *bill* in expenses).
const OTHER_INCOME_LABELS = new Set(['kg', 'kindergeld', 'eg', 'elterngeld', 'itr', 'tax return', 'enbw'])

/** One month's household figure: the sheet's own summary Household cell
 * when present, else the sum of household-tagged expense rows, else 0.
 * Exported for the Overview hero tile's "current month so far" row —
 * MUST stay the same formula the averages below are built from. Raw
 * (unrounded) so the accumulating callers keep their round-once-at-the-end
 * behavior; display callers round2 themselves. */
export function householdOf(m: MonthData): number {
  if (m.summary.household != null) return m.summary.household
  return m.expenses.filter((tx) => tx.household).reduce((s, tx) => s + (tx.amountEUR ?? 0), 0)
}

/** Average household over the trailing `n` months (by period, not array
 * order — callers don't guarantee sorted input). Window shrinks to what's
 * available; null when no months at all. */
function trailingAvg(sorted: MonthData[], n: number): number | null {
  if (sorted.length === 0) return null
  const window = sorted.slice(-n)
  return round2(window.reduce((s, m) => s + householdOf(m), 0) / window.length)
}

export function lifetimeTotals(months: MonthData[], now: Date = new Date()): LifetimeTotals {
  let salaryEUR = 0
  let otherIncomeEUR = 0
  let householdTotalEUR = 0
  let householdLow: HouseholdExtreme | null = null
  let householdHigh: HouseholdExtreme | null = null
  for (const m of months) {
    for (const tx of m.income) {
      if (tx.normLabel === 'salary') salaryEUR += tx.amountEUR ?? 0
      else if (OTHER_INCOME_LABELS.has(tx.normLabel)) otherIncomeEUR += tx.amountEUR ?? 0
    }
    const h = householdOf(m)
    householdTotalEUR += h
    if (h > 0) {
      if (!householdLow || h < householdLow.amountEUR) householdLow = { tab: m.tab, period: m.period, amountEUR: round2(h) }
      if (!householdHigh || h > householdHigh.amountEUR) householdHigh = { tab: m.tab, period: m.period, amountEUR: round2(h) }
    }
  }
  salaryEUR = round2(salaryEUR)
  otherIncomeEUR = round2(otherIncomeEUR)
  householdTotalEUR = round2(householdTotalEUR)
  const monthCount = months.length
  const nowKey = now.getFullYear() * 12 + now.getMonth() + 1
  const completed = months
    .filter((m) => m.period.year * 12 + m.period.month < nowKey)
    .sort((a, b) => a.period.year - b.period.year || a.period.month - b.period.month)
  return {
    salaryEUR,
    otherIncomeEUR,
    totalEUR: round2(salaryEUR + otherIncomeEUR),
    monthCount,
    householdTotalEUR,
    householdAvgEUR: monthCount > 0 ? round2(householdTotalEUR / monthCount) : null,
    householdAvg3EUR: trailingAvg(completed, 3),
    householdAvg6EUR: trailingAvg(completed, 6),
    householdLow,
    householdHigh,
  }
}
