import { describe, it, expect } from 'vitest'
import { detectRecurring } from '../src/lib/recurring'
import type { MonthData, Tx } from '../src/types'

const tx = (label: string, amountEUR: number | null): Tx => ({
  tab: 't',
  row: 1,
  label,
  normLabel: label.toLowerCase(),
  amountEUR,
  kind: 'expense',
  planned: false,
  household: false,
})

const month = (tab: string, year: number, monthNum: number, expenses: Tx[]): MonthData => ({
  tab,
  period: { year, month: monthNum },
  era: 'full',
  income: [],
  expenses,
  carryover: null,
  summary: { totalIncome: null, totalExpense: null, balance: null, household: null },
  banks: [],
  bankTotal: null,
  expectedActual: null,
  balanceAfterFuture: null,
  upcoming: [],
  issues: [],
})

describe('detectRecurring — 12-month window thresholds', () => {
  const months: MonthData[] = []
  for (let i = 1; i <= 12; i++) {
    const tab = `M${String(i).padStart(2, '0')}`
    const expenses: Tx[] = [tx('Rent', 800)] // every month -> monthly, fixed amount
    if (i <= 6) expenses.push(tx('Gym', 40)) // exactly 6/12 -> monthly boundary
    if (i <= 3) expenses.push(tx('Car Service', 120)) // exactly 3/12 -> sporadic boundary
    if (i <= 2) expenses.push(tx('Lotto', 10)) // 2/12 -> excluded
    expenses.push(tx('Last Month Balance', 500)) // transfer category -> always excluded
    months.push(month(tab, 2024, i, expenses))
  }
  const result = detectRecurring(months)

  it('flags a label seen every month as monthly with correct median/hitRate/lastSeenTab', () => {
    const rent = result.find((r) => r.normLabel === 'rent')
    expect(rent).toMatchObject({ cadence: 'monthly', monthsSeen: 12, medianAmountEUR: 800, lastSeenTab: 'M12', hitRate: 1 })
  })

  it('treats 6/12 as the monthly boundary', () => {
    const gym = result.find((r) => r.normLabel === 'gym')
    expect(gym?.cadence).toBe('monthly')
    expect(gym?.monthsSeen).toBe(6)
  })

  it('treats 3/12 as the sporadic boundary', () => {
    const carService = result.find((r) => r.normLabel === 'car service')
    expect(carService?.cadence).toBe('sporadic')
    expect(carService?.monthsSeen).toBe(3)
  })

  it('excludes labels seen fewer than 3 months', () => {
    expect(result.find((r) => r.normLabel === 'lotto')).toBeUndefined()
  })

  it('excludes labels categorized as transfer regardless of frequency', () => {
    expect(result.find((r) => r.normLabel === 'last month balance')).toBeUndefined()
  })

  it('sorts by monthsSeen desc, then normLabel', () => {
    const idx = (label: string) => result.findIndex((r) => r.normLabel === label)
    expect(idx('rent')).toBeLessThan(idx('gym'))
    expect(idx('gym')).toBeLessThan(idx('car service'))
  })
})

describe('detectRecurring — median with nulls', () => {
  it('computes the median over non-null amounts only', () => {
    const amounts: (number | null)[] = [100, null, 200, null, 300, null]
    const months = amounts.map((amt, i) => month(`M${i}`, 2024, i + 1, [tx('Subscription', amt)]))
    const result = detectRecurring(months)
    const sub = result.find((r) => r.normLabel === 'subscription')
    expect(sub?.medianAmountEUR).toBe(200)
    expect(sub?.monthsSeen).toBe(6)
    expect(sub?.cadence).toBe('monthly')
  })

  it('defaults medianAmountEUR to 0 when every occurrence has a null amount', () => {
    const months = [1, 2, 3].map((i) => month(`M${i}`, 2024, i, [tx('Mystery', null)]))
    const result = detectRecurring(months)
    expect(result.find((r) => r.normLabel === 'mystery')?.medianAmountEUR).toBe(0)
  })

  it('averages the two middle values when the amount count is even', () => {
    const amounts = [100, 200, 300, 400]
    const months = amounts.map((amt, i) => month(`M${i}`, 2024, i + 1, [tx('EvenCount', amt)]))
    const result = detectRecurring(months)
    expect(result.find((r) => r.normLabel === 'evencount')?.medianAmountEUR).toBe(250)
  })
})

describe('detectRecurring — trailing window', () => {
  it('takes only the latest N months when trailing < total months', () => {
    const months: MonthData[] = []
    for (let i = 1; i <= 12; i++) {
      // Present in every month, but an old label ceases appearing after month 9.
      const expenses = [tx('Rent', 800)]
      if (i <= 9) expenses.push(tx('OldService', 15))
      months.push(month(`M${i}`, 2024, i, expenses))
    }
    const result = detectRecurring(months, 3)
    // Trailing 3 = months 10,11,12 — OldService doesn't appear there at all.
    expect(result.find((r) => r.normLabel === 'oldservice')).toBeUndefined()
    const rent = result.find((r) => r.normLabel === 'rent')
    expect(rent?.monthsSeen).toBe(3)
    expect(rent?.hitRate).toBe(1)
  })

  it('scales the sporadic threshold too, so trailing=3 caps out at sporadic (monthly needs 4 hits, impossible in a 3-month window)', () => {
    const months: MonthData[] = []
    for (let i = 1; i <= 12; i++) {
      const expenses = i > 9 ? [tx('Netflix', 10)] : [] // present in the last 3 of 12 months
      months.push(month(`M${i}`, 2024, i, expenses))
    }
    const result = detectRecurring(months, 3)
    const netflix = result.find((r) => r.normLabel === 'netflix')
    expect(netflix?.cadence).toBe('sporadic')
    expect(netflix?.monthsSeen).toBe(3)
  })

  it('keeps sporadic reachable when trailing=6 (regression: previously collapsed into monthly at the same count)', () => {
    const threeMonths: MonthData[] = []
    const fourMonths: MonthData[] = []
    for (let i = 1; i <= 6; i++) {
      threeMonths.push(month(`A${i}`, 2024, i, i <= 3 ? [tx('Streaming', 9)] : []))
      fourMonths.push(month(`B${i}`, 2024, i, i <= 4 ? [tx('Streaming', 9)] : []))
    }
    const threeResult = detectRecurring(threeMonths, 6)
    const fourResult = detectRecurring(fourMonths, 6)
    expect(threeResult.find((r) => r.normLabel === 'streaming')?.cadence).toBe('sporadic')
    expect(fourResult.find((r) => r.normLabel === 'streaming')?.cadence).toBe('monthly')
  })
})

describe('detectRecurring — empty input', () => {
  it('returns an empty array', () => {
    expect(detectRecurring([])).toEqual([])
  })
})
