// Overview headline-card figures (owner live-review fix, 2026-07-26): the
// sheet's Total Income cell (G1, workbook-map.md §1.1/§1.2 Summary block)
// INCLUDES Last Month Balance/carryover in the live template, so comparing
// it against the app's own income-Tx sum (which correctly excludes
// carryover per the "carryover, not income" parser rule) reads as a false
// mismatch. Fix: sheet values are PRIMARY for income/expense/balance
// (matching what the user sees in the sheet itself), with a same-shape
// recompute as fallback for months where the sheet cell is null, plus an
// explicit drift surface so a genuine sheet/recompute disagreement is still
// visible (never silently swallowed) without becoming a Parser Health issue.
import type { MonthData } from '../types'
import { round2, sumAmounts } from './mathUtils'

export interface OverviewFigures {
  /** Headline income figure — summary.totalIncome (sheet G1) when present,
   * else incomeOwn + carryover. */
  income: number
  /** Headline expense figure — summary.totalExpense (sheet G2) when present,
   * else the sum of this month's expense Tx. */
  expense: number
  /** Headline balance figure — summary.balance (sheet G3) when present, else
   * the recomputed income - recomputed expense. */
  balance: number
  /** Recomputed income EXCLUDING carryover — always the app's own sum of
   * income Tx, regardless of which source backs `income` above. Shown as
   * the "own income" half of the secondary income-card line. */
  incomeOwn: number
  /** This month's carryover (Last Month Balance), 0 when null — shown as the
   * other half of the secondary income-card line. */
  carryover: number
  /** Recomputed income (incomeOwn + carryover) when it disagrees with
   * summary.totalIncome by more than 0.01, else null (no sheet value to
   * compare, or the two already agree — no drift hint shown). */
  incomeDrift: number | null
  /** Recomputed expense sum when it disagrees with summary.totalExpense by
   * more than 0.01, else null. */
  expenseDrift: number | null
  /** Recomputed balance (recomputed income - recomputed expense) when it
   * disagrees with summary.balance by more than 0.01, else null. */
  balanceDrift: number | null
}

const DRIFT_EPSILON = 0.01

function driftAgainst(sheetValue: number | null, recomputed: number): number | null {
  if (sheetValue == null) return null
  return Math.abs(sheetValue - recomputed) > DRIFT_EPSILON ? recomputed : null
}

export function overviewFigures(month: MonthData): OverviewFigures {
  const incomeOwn = round2(sumAmounts(month.income))
  const carryover = month.carryover ?? 0
  const recomputedIncome = round2(incomeOwn + carryover)
  const recomputedExpense = round2(sumAmounts(month.expenses))
  const recomputedBalance = round2(recomputedIncome - recomputedExpense)

  const income = month.summary.totalIncome ?? recomputedIncome
  const expense = month.summary.totalExpense ?? recomputedExpense
  const balance = month.summary.balance ?? recomputedBalance

  return {
    income,
    expense,
    balance,
    incomeOwn,
    carryover,
    incomeDrift: driftAgainst(month.summary.totalIncome, recomputedIncome),
    expenseDrift: driftAgainst(month.summary.totalExpense, recomputedExpense),
    balanceDrift: driftAgainst(month.summary.balance, recomputedBalance),
  }
}
