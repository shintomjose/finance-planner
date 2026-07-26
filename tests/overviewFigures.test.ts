import { describe, it, expect } from 'vitest'
import { overviewFigures } from '../src/lib/overviewFigures'
import type { MonthData, Tx } from '../src/types'

const tx = (label: string, amountEUR: number | null, kind: Tx['kind']): Tx => ({
  tab: 't',
  row: 1,
  label,
  normLabel: label.trim().replace(/\s+/g, ' ').toLowerCase(),
  amountEUR,
  kind,
  planned: amountEUR == null,
  household: false,
})

const baseMonth = (overrides: Partial<MonthData> = {}): MonthData => ({
  tab: 'JUN_25',
  period: { year: 2025, month: 6 },
  era: 'v2025',
  income: [tx('Salary', 1000, 'income'), tx('Revolut Add', 200, 'income')],
  expenses: [tx('Rent', 850, 'expense'), tx('Groceries', 150, 'expense')],
  carryover: 300,
  summary: { totalIncome: null, totalExpense: null, balance: null, household: null },
  banks: [],
  bankTotal: null,
  expectedActual: null,
  balanceAfterFuture: null,
  upcoming: [],
  issues: [],
  ...overrides,
})

describe('overviewFigures — sheet-primary', () => {
  it('uses summary.totalIncome/totalExpense/balance when present and non-null', () => {
    const m = baseMonth({ summary: { totalIncome: 1500, totalExpense: 1000, balance: 500, household: null } })
    const f = overviewFigures(m)
    expect(f.income).toBe(1500)
    expect(f.expense).toBe(1000)
    expect(f.balance).toBe(500)
  })

  it('always exposes incomeOwn (recomputed income excluding carryover) and carryover regardless of sheet source', () => {
    const m = baseMonth({ summary: { totalIncome: 1500, totalExpense: 1000, balance: 500, household: null } })
    const f = overviewFigures(m)
    expect(f.incomeOwn).toBe(1200) // 1000 + 200
    expect(f.carryover).toBe(300)
  })
})

describe('overviewFigures — fallback recompute', () => {
  it('falls back to income sum + carryover when summary.totalIncome is null', () => {
    const m = baseMonth() // summary all null
    const f = overviewFigures(m)
    expect(f.income).toBe(1500) // 1000 + 200 + 300 carryover
  })

  it('falls back to expense sum when summary.totalExpense is null', () => {
    const m = baseMonth()
    const f = overviewFigures(m)
    expect(f.expense).toBe(1000) // 850 + 150
  })

  it('falls back to recomputed income - recomputed expense when summary.balance is null', () => {
    const m = baseMonth()
    const f = overviewFigures(m)
    expect(f.balance).toBe(500) // 1500 - 1000
  })

  it('treats a null carryover as 0 in the recompute', () => {
    const m = baseMonth({ carryover: null })
    const f = overviewFigures(m)
    expect(f.carryover).toBe(0)
    expect(f.income).toBe(1200) // 1000 + 200 + 0
  })
})

describe('overviewFigures — drift', () => {
  it('sets incomeDrift to the recomputed value when it differs from the sheet value by > 0.01', () => {
    const m = baseMonth({ summary: { totalIncome: 1600, totalExpense: null, balance: null, household: null } })
    const f = overviewFigures(m)
    // recomputed income = 1000 + 200 + 300 = 1500, sheet says 1600 -> drift
    expect(f.incomeDrift).toBe(1500)
  })

  it('leaves incomeDrift null when sheet and recompute agree within 0.01', () => {
    const m = baseMonth({ summary: { totalIncome: 1500.005, totalExpense: null, balance: null, household: null } })
    const f = overviewFigures(m)
    expect(f.incomeDrift).toBeNull()
  })

  it('leaves incomeDrift null when summary.totalIncome is null (no sheet value to compare)', () => {
    const m = baseMonth()
    const f = overviewFigures(m)
    expect(f.incomeDrift).toBeNull()
  })

  it('sets expenseDrift the same way for totalExpense', () => {
    const m = baseMonth({ summary: { totalIncome: null, totalExpense: 1200, balance: null, household: null } })
    const f = overviewFigures(m)
    expect(f.expenseDrift).toBe(1000)
  })

  it('sets balanceDrift the same way for balance', () => {
    const m = baseMonth({ summary: { totalIncome: null, totalExpense: null, balance: 100, household: null } })
    const f = overviewFigures(m)
    expect(f.balanceDrift).toBe(500)
  })
})
