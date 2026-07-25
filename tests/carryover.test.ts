import { describe, it, expect } from 'vitest'
import { computeChain } from '../src/lib/carryover'
import type { MonthData, Tx } from '../src/types'

const tx = (amountEUR: number | null, kind: 'income' | 'expense' = 'expense', label = 'x'): Tx => ({
  tab: 't',
  row: 1,
  label,
  normLabel: label.toLowerCase(),
  amountEUR,
  kind,
  planned: false,
  household: false,
})

const month = (tab: string, year: number, monthNum: number, opts: Partial<MonthData> = {}): MonthData => ({
  tab,
  period: { year, month: monthNum },
  era: 'full',
  income: [],
  expenses: [],
  carryover: null,
  summary: { totalIncome: null, totalExpense: null, balance: null, household: null },
  banks: [],
  bankTotal: null,
  expectedActual: null,
  balanceAfterFuture: null,
  upcoming: [],
  issues: [],
  ...opts,
})

describe('computeChain', () => {
  it('starts from the earliest month sheet carryover', () => {
    const m1 = month('JAN_24', 2024, 1, { carryover: 500 })
    expect(computeChain([m1])).toEqual([{ tab: 'JAN_24', computed: 500, sheet: 500, driftEUR: 0 }])
  })

  it('defaults the earliest month to 0 when it has no sheet carryover', () => {
    const m1 = month('JAN_24', 2024, 1, { carryover: null })
    expect(computeChain([m1])).toEqual([{ tab: 'JAN_24', computed: 0, sheet: null, driftEUR: null }])
  })

  it('chains computed carryover forward from prev income - expense', () => {
    const m1 = month('JAN_24', 2024, 1, { carryover: 100, income: [tx(1000, 'income')], expenses: [tx(400)] })
    const m2 = month('FEB_24', 2024, 2, { carryover: 700 })
    const result = computeChain([m1, m2])
    // computed(FEB) = 100 + 1000 - 400 = 700
    expect(result[1]).toEqual({ tab: 'FEB_24', computed: 700, sheet: 700, driftEUR: 0 })
  })

  it('reports drift when sheet carryover disagrees with computed', () => {
    const m1 = month('JAN_24', 2024, 1, { carryover: 100, income: [tx(1000, 'income')], expenses: [tx(400)] })
    const m2 = month('FEB_24', 2024, 2, { carryover: 650 })
    const result = computeChain([m1, m2])
    expect(result[1].computed).toBe(700)
    expect(result[1].driftEUR).toBe(-50)
  })

  it('reports driftEUR null when a non-first month has no sheet carryover', () => {
    const m1 = month('JAN_24', 2024, 1, { carryover: 100, income: [tx(1000, 'income')], expenses: [tx(400)] })
    const m2 = month('FEB_24', 2024, 2, { carryover: null })
    const result = computeChain([m1, m2])
    expect(result[1]).toEqual({ tab: 'FEB_24', computed: 700, sheet: null, driftEUR: null })
  })

  it('treats null Tx amounts as 0', () => {
    const m1 = month('JAN_24', 2024, 1, {
      carryover: 0,
      income: [tx(null, 'income'), tx(500, 'income')],
      expenses: [tx(null), tx(200)],
    })
    const m2 = month('FEB_24', 2024, 2)
    const result = computeChain([m1, m2])
    expect(result[1].computed).toBe(300)
  })

  it('re-sorts months defensively by period regardless of input order', () => {
    const m1 = month('JAN_24', 2024, 1, { carryover: 100, income: [tx(1000, 'income')], expenses: [tx(400)] })
    const m2 = month('FEB_24', 2024, 2, { carryover: 700 })
    const result = computeChain([m2, m1])
    expect(result.map((r) => r.tab)).toEqual(['JAN_24', 'FEB_24'])
  })

  it('rounds computed and drift to 2 decimals', () => {
    const m1 = month('JAN_24', 2024, 1, { carryover: 0.1, income: [tx(0.1, 'income')], expenses: [tx(0.03)] })
    const m2 = month('FEB_24', 2024, 2, { carryover: 0.2 })
    const result = computeChain([m1, m2])
    expect(result[1].computed).toBe(0.17)
    expect(result[1].driftEUR).toBe(0.03)
  })

  it('handles an empty months list', () => {
    expect(computeChain([])).toEqual([])
  })
})
