import { describe, it, expect } from 'vitest'
import { budgetActuals } from '../src/lib/budgetActuals'
import type { Budget, MonthData, Tx } from '../src/types'

const tx = (label: string, amountEUR: number | null): Tx => ({
  tab: 't',
  row: 1,
  label,
  normLabel: label.trim().replace(/\s+/g, ' ').toLowerCase(),
  amountEUR,
  kind: 'expense',
  planned: false,
  household: false,
})

const month = (year: number, monthNum: number, expenses: Tx[]): MonthData => ({
  tab: `M_${monthNum}`,
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

const BUDGET: Budget[] = [
  { category: 'Groceries', plannedMonthly: 300 },
  { category: ' Fixed ', plannedMonthly: 1000 }, // whitespace, tests normLabel trim/collapse
  { category: 'Lifestyle', plannedMonthly: 0 }, // zero-planned edge case
  { category: 'Family', plannedMonthly: 100 },
]

describe('budgetActuals — category matching', () => {
  it('sums actual expenses into the matching budget row via categorize() bucket <-> normLabel(category)', () => {
    // Edeka/Kaufland -> groceries bucket; Rent -> fixed bucket (seed map).
    const m = month(2024, 6, [tx('Edeka', 120), tx('Kaufland', 80), tx('Rent', 850)])
    const view = budgetActuals(m, BUDGET, {}, new Date(2024, 5, 15), null)
    const groceries = view.rows.find((r) => r.category === 'Groceries')
    const fixed = view.rows.find((r) => r.category === ' Fixed ')
    expect(groceries?.actual).toBe(200)
    expect(fixed?.actual).toBe(850)
  })

  it('is case- and whitespace-insensitive on budget.category vs the categorize() bucket', () => {
    const m = month(2024, 6, [tx('Sachin', 50)]) // -> family bucket
    const view = budgetActuals(m, BUDGET, {}, new Date(2024, 5, 15), null)
    expect(view.rows.find((r) => r.category === 'Family')?.actual).toBe(50)
  })

  it('applies categoryOverrides through to the bucket match', () => {
    const m = month(2024, 6, [tx('Some Random Shop', 40)])
    const overrides = { 'some random shop': 'groceries' }
    const view = budgetActuals(m, BUDGET, overrides, new Date(2024, 5, 15), null)
    expect(view.rows.find((r) => r.category === 'Groceries')?.actual).toBe(40)
  })

  it('a budget row with no matching expenses has actual 0', () => {
    const m = month(2024, 6, [tx('Edeka', 50)])
    const view = budgetActuals(m, BUDGET, {}, new Date(2024, 5, 15), null)
    expect(view.rows.find((r) => r.category === 'Family')?.actual).toBe(0)
  })
})

describe('budgetActuals — pctOfBudget / over', () => {
  it('computes pctOfBudget and sets over=true past 100%', () => {
    const m = month(2024, 6, [tx('Edeka', 330)]) // 330/300 = 110%
    const view = budgetActuals(m, BUDGET, {}, new Date(2024, 5, 15), null)
    const groceries = view.rows.find((r) => r.category === 'Groceries')!
    expect(groceries.pctOfBudget).toBe(110)
    expect(groceries.over).toBe(true)
  })

  it('under budget stays over=false', () => {
    const m = month(2024, 6, [tx('Edeka', 150)])
    const view = budgetActuals(m, BUDGET, {}, new Date(2024, 5, 15), null)
    const groceries = view.rows.find((r) => r.category === 'Groceries')!
    expect(groceries.pctOfBudget).toBe(50)
    expect(groceries.over).toBe(false)
  })

  it('zero-planned budget row with actual spend is Infinity% and over', () => {
    const m = month(2024, 6, [tx('Church', 20)]) // -> lifestyle bucket, plannedMonthly 0
    const view = budgetActuals(m, BUDGET, {}, new Date(2024, 5, 15), null)
    const lifestyle = view.rows.find((r) => r.category === 'Lifestyle')!
    expect(lifestyle.pctOfBudget).toBe(Infinity)
    expect(lifestyle.over).toBe(true)
  })

  it('zero-planned budget row with zero actual is 0% and not over', () => {
    const m = month(2024, 6, [tx('Edeka', 50)])
    const view = budgetActuals(m, BUDGET, {}, new Date(2024, 5, 15), null)
    const lifestyle = view.rows.find((r) => r.category === 'Lifestyle')!
    expect(lifestyle.pctOfBudget).toBe(0)
    expect(lifestyle.over).toBe(false)
  })
})

describe('budgetActuals — pctOfMonth', () => {
  it('is the elapsed fraction of the current month when the month matches now', () => {
    const m = month(2024, 6, [])
    const view = budgetActuals(m, BUDGET, {}, new Date(2024, 5, 15), null) // June 15 of 30 days
    expect(view.rows[0]?.pctOfMonth).toBeCloseTo((15 / 30) * 100, 5)
  })

  it('is 100 for a month before now', () => {
    const m = month(2024, 3, [])
    const view = budgetActuals(m, BUDGET, {}, new Date(2024, 5, 15), null)
    expect(view.rows[0]?.pctOfMonth).toBe(100)
  })

  it('is 0 for a month after now', () => {
    const m = month(2024, 9, [])
    const view = budgetActuals(m, BUDGET, {}, new Date(2024, 5, 15), null)
    expect(view.rows[0]?.pctOfMonth).toBe(0)
  })
})

describe('budgetActuals — unbudgeted spill', () => {
  it('lists categories with actual > 0 absent from the budget, sorted by actual desc', () => {
    // 'Salary'/etc are seeded as income-bucket labels; not in BUDGET at all.
    const m = month(2024, 6, [tx('Doner', 15), tx('Petrol', 60)]) // both -> lifestyle bucket... wait see below
    const view = budgetActuals(m, BUDGET, {}, new Date(2024, 5, 15), null)
    // Doner/Petrol both fall into the seeded 'lifestyle' bucket, which IS
    // budgeted here (category: 'Lifestyle') — so use an uncategorized label
    // instead to actually produce spill.
    const m2 = month(2024, 6, [tx('Totally Unknown Shop', 25), tx('Another Mystery', 60)])
    const view2 = budgetActuals(m2, BUDGET, {}, new Date(2024, 5, 15), null)
    expect(view2.unbudgeted).toEqual([
      { category: 'uncategorized', actual: 85 },
    ])
    expect(view.unbudgeted).toEqual([]) // sanity: lifestyle spend absorbed into the budgeted row
  })

  it('excludes zero-actual buckets and matched buckets from the spill list', () => {
    const m = month(2024, 6, [tx('Edeka', 50), tx('Salary Bonus Thing', 0)])
    const view = budgetActuals(m, BUDGET, {}, new Date(2024, 5, 15), null)
    expect(view.unbudgeted).toEqual([])
  })
})

describe('budgetActuals — totals', () => {
  it('planned sums every budget row; actual sums every categorized expense (budgeted + unbudgeted)', () => {
    const m = month(2024, 6, [tx('Edeka', 100), tx('Totally Unknown Shop', 40)])
    const view = budgetActuals(m, BUDGET, {}, new Date(2024, 5, 15), null)
    expect(view.totals.planned).toBe(1400) // 300+1000+0+100
    expect(view.totals.actual).toBe(140)
    expect(view.totals.surplus).toBe(1260)
  })

  it('passes plannedSurplus through unchanged, including null', () => {
    const m = month(2024, 6, [])
    expect(budgetActuals(m, BUDGET, {}, new Date(2024, 5, 15), 538.69).totals.plannedSurplus).toBe(538.69)
    expect(budgetActuals(m, BUDGET, {}, new Date(2024, 5, 15), null).totals.plannedSurplus).toBeNull()
  })
})

describe('budgetActuals — no month selected', () => {
  it('returns every budget row at zero actual, no spill, totals from budget alone', () => {
    const view = budgetActuals(undefined, BUDGET, {}, new Date(2024, 5, 15), 538.69)
    expect(view.rows).toHaveLength(BUDGET.length)
    expect(view.rows.every((r) => r.actual === 0 && r.pctOfBudget === 0 && r.pctOfMonth === 0 && !r.over)).toBe(true)
    expect(view.unbudgeted).toEqual([])
    expect(view.totals).toEqual({ planned: 1400, actual: 0, surplus: 1400, plannedSurplus: 538.69 })
  })
})
