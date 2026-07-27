import { describe, expect, it } from 'vitest'
import { buildKpis, monthMetrics } from '../src/lib/kpis'
import type { MonthData, Tx } from '../src/types'

let row = 0
function tx(label: string, amountEUR: number | null, kind: 'income' | 'expense'): Tx {
  return { tab: 'T', row: ++row, label, normLabel: label.toLowerCase(), amountEUR, kind, planned: amountEUR === null, household: false }
}

function month(tab: string, year: number, mo: number, over: Partial<MonthData> = {}): MonthData {
  return {
    tab, period: { year, month: mo }, era: 'v2025',
    income: [tx('salary', 1000, 'income')], expenses: [tx('rent', 400, 'expense')],
    carryover: 50,
    summary: { totalIncome: null, totalExpense: null, balance: null, household: null },
    banks: [{ name: 'Main', amountEUR: 200 }, { name: 'Revolut Savings', amountEUR: 30 }],
    bankTotal: null, expectedActual: null, balanceAfterFuture: null,
    upcoming: [{ name: 'Card', total: 100, toPay: 80 }, { name: 'Food Home', total: 700, toPay: 120 }],
    issues: [], ...over,
  }
}

describe('buildKpis', () => {
  it('income excludes carryover', () => {
    const k = buildKpis([month('JUN_25', 2025, 6)], 'JUN_25')
    const income = k.find((c) => c.id === 'income')!
    expect(income.value).toBe(1000) // not 1050
    expect(income.note).toContain('carryover')
  })

  it('saved = own income minus expenses', () => {
    const k = buildKpis([month('JUN_25', 2025, 6)], 'JUN_25')
    expect(k.find((c) => c.id === 'saved')!.value).toBe(600)
  })

  it('upcoming sums bills only — food-home tracker excluded', () => {
    const k = buildKpis([month('JUN_25', 2025, 6)], 'JUN_25')
    expect(k.find((c) => c.id === 'upcoming')!.value).toBe(80)
  })

  it('cash uses bank sum fallback; savings card removed (2026-07-27), pot still feeds networth', () => {
    const k = buildKpis([month('JUN_25', 2025, 6)], 'JUN_25')
    expect(k.find((c) => c.id === 'cash')!.value).toBe(230)
    expect(k.some((c) => c.id === ('savings' as string))).toBe(false)
    expect(k).toHaveLength(6)
  })

  it('owner labels (2026-07-27): saved and cash cards renamed', () => {
    const k = buildKpis([month('JUN_25', 2025, 6)], 'JUN_25')
    expect(k.find((c) => c.id === 'saved')!.label).toBe('This Month +/-')
    expect(k.find((c) => c.id === 'cash')!.label).toBe('Total Savings +/-')
  })

  it('delta + series across months, window ends at selected', () => {
    const m1 = month('MAY_25', 2025, 5, { expenses: [tx('rent', 300, 'expense')] })
    const m2 = month('JUN_25', 2025, 6)
    const k = buildKpis([m2, m1], 'JUN_25') // unsorted input on purpose
    const saved = k.find((c) => c.id === 'saved')!
    expect(saved.series).toEqual([700, 600])
    expect(saved.delta).toBe(-100)
  })

  it('missing data → null values, no throw', () => {
    const bare = month('JAN_22', 2022, 1, { banks: [], upcoming: [], bankTotal: null })
    const k = buildKpis([bare], 'JAN_22')
    expect(k.find((c) => c.id === 'cash')!.value).toBeNull()
    expect(k.find((c) => c.id === 'networth')!.value).toBeNull()
  })

  it('cash series preserves a null gap for a month with no bank data (not coerced to 0)', () => {
    const m1 = month('MAY_25', 2025, 5, { banks: [], bankTotal: null })
    const m2 = month('JUN_25', 2025, 6)
    const k = buildKpis([m1, m2], 'JUN_25')
    const cash = k.find((c) => c.id === 'cash')!
    expect(cash.series).toEqual([null, 230])
    expect(cash.value).toBe(230)
    expect(cash.delta).toBeNull() // previous month's cash is null, not 0 — delta must not be value−0
  })

  it('note fallbacks: no carryover; savings pot null without /sav/i account', () => {
    const m = month('MAR_25', 2025, 3, { carryover: 0, banks: [{ name: 'Main', amountEUR: 200 }] })
    const k = buildKpis([m], 'MAR_25')
    expect(k.find((c) => c.id === 'income')!.note).toContain('no carryover')
    expect(monthMetrics(m).savings).toBeNull()
  })

  it('monthMetrics (exported for Trends reuse) computes the same upcoming figure as buildKpis', () => {
    expect(monthMetrics(month('JUN_25', 2025, 6)).upcoming).toBe(80)
  })

  it('networth includes invested when provided', () => {
    const k = buildKpis([month('JUN_25', 2025, 6)], 'JUN_25', { investedEUR: 1000 })
    // cash 230 + savings 30 + 1000 − upcoming 80
    expect(k.find((c) => c.id === 'networth')!.value).toBe(1180)
    // de-DE thousands/decimal convention (matches Money's own locale), not
    // en-US — see kpis.ts's fmtNum comment.
    expect(k.find((c) => c.id === 'networth')!.note).toContain('1.000,00')
  })
})
