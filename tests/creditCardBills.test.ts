import { describe, it, expect } from 'vitest'
import { creditCardBills } from '../src/lib/creditCardBills'
import { normLabel } from '../src/lib/normalize'
import type { Tx } from '../src/types'

const tx = (label: string, amountEUR: number | null, kind: 'income' | 'expense' = 'expense'): Tx => ({
  tab: 'JUN_25',
  row: 1,
  label,
  normLabel: normLabel(label),
  amountEUR,
  kind,
  planned: false,
  household: false,
})

describe('creditCardBills', () => {
  it('groups credit-card-category expenses by label with a footer total', () => {
    const expenses = [tx('Amex', 120.5), tx('Sparkasse', 40), tx('Rent', 850)]
    const result = creditCardBills(expenses)
    expect(result.rows).toEqual([
      { label: 'Amex', amountEUR: 120.5 },
      { label: 'Sparkasse', amountEUR: 40 },
    ])
    expect(result.total).toBe(160.5)
  })

  it('merges the Advancia typo and the correct Advanzia spelling into one row', () => {
    const expenses = [tx('Advancia', 30), tx('Advanzia', 15.25)]
    const result = creditCardBills(expenses)
    expect(result.rows).toEqual([{ label: 'Advanzia', amountEUR: 45.25 }])
    expect(result.total).toBe(45.25)
  })

  it('sums multiple rows for the same card label', () => {
    const expenses = [tx('Amex', 10), tx('Amex', 5.5)]
    const result = creditCardBills(expenses)
    expect(result.rows).toEqual([{ label: 'Amex', amountEUR: 15.5 }])
  })

  it('ignores expenses outside the credit card category', () => {
    const expenses = [tx('Rent', 850), tx('Church', 20)]
    const result = creditCardBills(expenses)
    expect(result.rows).toEqual([])
    expect(result.total).toBe(0)
  })

  it('treats a null amountEUR (planned/unpaid) as zero in the sum, not dropped', () => {
    const expenses = [tx('Amex', null), tx('Amex', 10)]
    const result = creditCardBills(expenses)
    expect(result.rows).toEqual([{ label: 'Amex', amountEUR: 10 }])
  })

  it('respects category overrides', () => {
    const expenses = [tx('Rent', 850)]
    const result = creditCardBills(expenses, { rent: 'credit card' })
    expect(result.rows).toEqual([{ label: 'Rent', amountEUR: 850 }])
  })

  it('returns empty rows and zero total for an empty expense list', () => {
    expect(creditCardBills([])).toEqual({ rows: [], total: 0 })
  })
})
