import { describe, expect, it } from 'vitest'
import { lifetimeTotals } from '../src/lib/lifetimeTotals'
import type { MonthData, Tx } from '../src/types'

let row = 0
function tx(label: string, amountEUR: number | null, kind: 'income' | 'expense', household = false): Tx {
  return { tab: 'T', row: ++row, label, normLabel: label.toLowerCase(), amountEUR, kind, planned: amountEUR === null, household }
}

function month(tab: string, income: Tx[], over: Partial<MonthData> = {}): MonthData {
  return {
    tab, period: { year: 2025, month: 1 }, era: 'v2025',
    income, expenses: [], carryover: null,
    summary: { totalIncome: null, totalExpense: null, balance: null, household: null },
    banks: [], bankTotal: null, expectedActual: null, balanceAfterFuture: null,
    upcoming: [], issues: [], ...over,
  }
}

describe('lifetimeTotals', () => {
  it('sums salary and KG/KinderGeld across months; other income excluded', () => {
    const months = [
      month('A', [tx('Salary', 1000, 'income'), tx('KG', 250, 'income'), tx('Revolut Add', 500, 'income')]),
      month('B', [tx('Salary', 1100, 'income'), tx('KinderGeld', 255, 'income')]),
    ]
    const t = lifetimeTotals(months)
    expect(t.salaryEUR).toBe(2100)
    expect(t.kgEUR).toBe(505)
    expect(t.totalEUR).toBe(2605)
    expect(t.monthCount).toBe(2)
  })

  it('carryover never counts (it is not in income[] at all — parser guarantee)', () => {
    // lifetimeTotals reads income[] only; a month whose only inflow was
    // carryover contributes 0.
    const t = lifetimeTotals([month('A', [])])
    expect(t.totalEUR).toBe(0)
  })

  it('household: summary cell preferred, tagged-expense fallback, 0 when neither; ALL months in denominator', () => {
    const withSummary = month('A', [], { summary: { totalIncome: null, totalExpense: null, balance: null, household: 600 } })
    const withTagged = month('B', [], { expenses: [tx('Rent', 500, 'expense', true), tx('Cig', 9, 'expense', false)] })
    const withNeither = month('C', [])
    const t = lifetimeTotals([withSummary, withTagged, withNeither])
    expect(t.householdTotalEUR).toBe(1100) // 600 + 500 + 0
    expect(t.householdAvgEUR).toBe(366.67) // 1100 / 3, round2
  })

  it('empty months → zero totals, null average, null extremes', () => {
    const t = lifetimeTotals([])
    expect(t.totalEUR).toBe(0)
    expect(t.householdAvgEUR).toBeNull()
    expect(t.householdLow).toBeNull()
    expect(t.householdHigh).toBeNull()
  })

  it('household low/high pick the cheapest and priciest POSITIVE months — 0-data months never win lowest', () => {
    const mk = (tab: string, mo: number, household: number | null) =>
      month(tab, [], { period: { year: 2025, month: mo }, summary: { totalIncome: null, totalExpense: null, balance: null, household } })
    const t = lifetimeTotals([mk('A', 1, 600), mk('B', 2, null), mk('C', 3, 350.5), mk('D', 4, 900)])
    expect(t.householdLow).toEqual({ tab: 'C', period: { year: 2025, month: 3 }, amountEUR: 350.5 })
    expect(t.householdHigh).toEqual({ tab: 'D', period: { year: 2025, month: 4 }, amountEUR: 900 })
  })

  it('trailing 3/6-month averages: last N by PERIOD (input order irrelevant), zero-months count in denominator', () => {
    const mk = (tab: string, mo: number, household: number | null) =>
      month(tab, [], { period: { year: 2025, month: mo }, summary: { totalIncome: null, totalExpense: null, balance: null, household } })
    // Shuffled input on purpose — periods 1..7; households 100..700.
    const months = [mk('E', 5, 500), mk('A', 1, 100), mk('G', 7, 700), mk('C', 3, 300), mk('B', 2, 200), mk('F', 6, null), mk('D', 4, 400)]
    const t = lifetimeTotals(months)
    expect(t.householdAvg3EUR).toBe(400) // (500 + 0 + 700) / 3 — month 6 has no data, still counts
    expect(t.householdAvg6EUR).toBe(350) // (200+300+400+500+0+700) / 6
  })

  it('trailing averages skip the current in-progress month (owner: only completed months count)', () => {
    const mk = (tab: string, mo: number, household: number) =>
      month(tab, [], { period: { year: 2025, month: mo }, summary: { totalIncome: null, totalExpense: null, balance: null, household } })
    const months = [mk('A', 5, 500), mk('B', 6, 600), mk('C', 7, 999)]
    // "now" inside July 2025 → month 7 is in progress, excluded; window
    // shrinks to the 2 completed months.
    const t = lifetimeTotals(months, new Date(2025, 6, 15))
    expect(t.householdAvg3EUR).toBe(550) // (500 + 600) / 2
    // Lifetime average still counts ALL months — unchanged by this rule.
    expect(t.householdAvgEUR).toBe(699.67)
  })

  it('trailing averages shrink the window when fewer months exist; null when none', () => {
    const one = month('A', [], { summary: { totalIncome: null, totalExpense: null, balance: null, household: 420 } })
    expect(lifetimeTotals([one]).householdAvg3EUR).toBe(420)
    expect(lifetimeTotals([one]).householdAvg6EUR).toBe(420)
    expect(lifetimeTotals([]).householdAvg3EUR).toBeNull()
    expect(lifetimeTotals([]).householdAvg6EUR).toBeNull()
  })

  it('null amounts (planned rows) contribute nothing', () => {
    const t = lifetimeTotals([month('A', [tx('Salary', null, 'income')])])
    expect(t.salaryEUR).toBe(0)
  })
})
