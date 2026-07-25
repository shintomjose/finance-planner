import { describe, it, expect } from 'vitest'
import { categorySeries, householdSplit, monthlyTotals, topMovers, yoySameMonth } from '../src/lib/trends'
import type { MonthData, Tx } from '../src/types'

const tx = (label: string, amountEUR: number | null, opts: Partial<Tx> = {}): Tx => ({
  tab: 't',
  row: 1,
  label,
  normLabel: label.trim().replace(/\s+/g, ' ').toLowerCase(),
  amountEUR,
  kind: 'expense',
  planned: false,
  household: false,
  ...opts,
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

describe('monthlyTotals', () => {
  it('sums income and expense per month, excluding carryover, and computes net', () => {
    const m = month('JAN_24', 2024, 1, {
      income: [tx('Salary', 2000, { kind: 'income' })],
      expenses: [tx('Rent', 800), tx('Edeka', 200)],
      carryover: 500, // must NOT be added into income
    })
    const [point] = monthlyTotals([m])
    expect(point).toEqual({ tab: 'JAN_24', year: 2024, month: 1, income: 2000, expense: 1000, net: 1000 })
  })

  it('treats null amounts as 0', () => {
    const m = month('JAN_24', 2024, 1, { income: [tx('x', null, { kind: 'income' })], expenses: [tx('y', null)] })
    const [point] = monthlyTotals([m])
    expect(point).toEqual({ tab: 'JAN_24', year: 2024, month: 1, income: 0, expense: 0, net: 0 })
  })

  it('sorts defensively by period regardless of input order', () => {
    const m1 = month('JAN_24', 2024, 1)
    const m2 = month('FEB_24', 2024, 2)
    const result = monthlyTotals([m2, m1])
    expect(result.map((p) => p.tab)).toEqual(['JAN_24', 'FEB_24'])
  })

  it('handles an empty months list', () => {
    expect(monthlyTotals([])).toEqual([])
  })

  it('single month does not crash (boundary for EmptyState screen logic)', () => {
    const m = month('JAN_24', 2024, 1, { expenses: [tx('Rent', 100)] })
    expect(monthlyTotals([m])).toEqual([{ tab: 'JAN_24', year: 2024, month: 1, income: 0, expense: 100, net: -100 }])
  })
})

describe('categorySeries', () => {
  it('splits into top-N categories by total spend, no other rollup when <= topN categories exist', () => {
    const m = month('JAN_24', 2024, 1, {
      expenses: [tx('Edeka', 100), tx('Rent', 800)], // groceries, fixed
    })
    const series = categorySeries([m], {}, 6)
    const categories = series.map((s) => s.category).sort()
    expect(categories).toEqual(['fixed', 'groceries'])
  })

  it('rolls the tail beyond topN into an "other" series that sums correctly', () => {
    // 4 distinct seed categories across 2 months; topN=2 keeps the 2 largest, rest -> other.
    const m1 = month('JAN_24', 2024, 1, {
      expenses: [
        tx('Rent', 800), // fixed
        tx('Edeka', 100), // groceries
        tx('Sachin', 50), // family
        tx('Church', 10), // lifestyle
      ],
    })
    const m2 = month('FEB_24', 2024, 2, {
      expenses: [
        tx('Rent', 800), // fixed
        tx('Edeka', 50), // groceries
        tx('Sachin', 20), // family
      ],
    })
    const series = categorySeries([m1, m2], {}, 2)
    const byCat = new Map(series.map((s) => [s.category, s]))
    expect([...byCat.keys()].sort()).toEqual(['fixed', 'groceries', 'other'])

    const other = byCat.get('other')!
    // JAN: family(50) + lifestyle(10) = 60; FEB: family(20) = 20
    expect(other.points.find((p) => p.tab === 'JAN_24')?.value).toBe(60)
    expect(other.points.find((p) => p.tab === 'FEB_24')?.value).toBe(20)

    const fixed = byCat.get('fixed')!
    expect(fixed.points.find((p) => p.tab === 'JAN_24')?.value).toBe(800)
    expect(fixed.points.find((p) => p.tab === 'FEB_24')?.value).toBe(800)
  })

  it('every series has one point per month, in month order, even when a category is absent that month', () => {
    const m1 = month('JAN_24', 2024, 1, { expenses: [tx('Edeka', 100)] })
    const m2 = month('FEB_24', 2024, 2, { expenses: [tx('Rent', 800)] })
    const series = categorySeries([m1, m2], {}, 6)
    const groceries = series.find((s) => s.category === 'groceries')!
    expect(groceries.points).toEqual([
      { tab: 'JAN_24', value: 100 },
      { tab: 'FEB_24', value: 0 },
    ])
  })

  it('applies categoryOverrides', () => {
    const m = month('JAN_24', 2024, 1, { expenses: [tx('Mystery Shop', 40)] })
    const series = categorySeries([m], { 'mystery shop': 'groceries' }, 6)
    expect(series.map((s) => s.category)).toEqual(['groceries'])
  })

  it('handles an empty months list', () => {
    expect(categorySeries([], {}, 6)).toEqual([])
  })
})

describe('yoySameMonth', () => {
  it('computes current vs previous-year same-month expense totals and deltaPct', () => {
    const prev = month('JUN_23', 2023, 6, { expenses: [tx('Rent', 800)] })
    const cur = month('JUN_24', 2024, 6, { expenses: [tx('Rent', 1000)] })
    const now = new Date(2024, 6, 1) // within 2024
    const result = yoySameMonth([prev, cur], now)
    const june = result.find((r) => r.month === 6)!
    expect(june).toEqual({ month: 6, monthName: 'Jun', current: 1000, previous: 800, deltaPct: 25 })
  })

  it('returns null current/deltaPct for a month with no current-year data, keeping previous', () => {
    const prev = month('MAR_23', 2023, 3, { expenses: [tx('Rent', 500)] })
    const now = new Date(2024, 6, 1)
    const result = yoySameMonth([prev], now)
    const march = result.find((r) => r.month === 3)!
    expect(march).toEqual({ month: 3, monthName: 'Mar', current: null, previous: 500, deltaPct: null })
  })

  it('returns null previous/deltaPct when the prior-year month is missing (boundary)', () => {
    const cur = month('MAR_24', 2024, 3, { expenses: [tx('Rent', 500)] })
    const now = new Date(2024, 6, 1)
    const result = yoySameMonth([cur], now)
    const march = result.find((r) => r.month === 3)!
    expect(march).toEqual({ month: 3, monthName: 'Mar', current: 500, previous: null, deltaPct: null })
  })

  it('returns 12 entries, Jan through Dec', () => {
    const now = new Date(2024, 0, 1)
    const result = yoySameMonth([], now)
    expect(result).toHaveLength(12)
    expect(result.map((r) => r.monthName)).toEqual([
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ])
  })

  it('deltaPct is null (not Infinity) when previous is zero', () => {
    const prev = month('JUN_23', 2023, 6, { expenses: [] })
    const cur = month('JUN_24', 2024, 6, { expenses: [tx('Rent', 100)] })
    const now = new Date(2024, 6, 1)
    const result = yoySameMonth([prev, cur], now)
    expect(result.find((r) => r.month === 6)?.deltaPct).toBeNull()
  })
})

describe('topMovers', () => {
  it('compares the latest month per-category spend against the trailing average', () => {
    const m1 = month('JAN_24', 2024, 1, { expenses: [tx('Edeka', 100)] }) // groceries
    const m2 = month('FEB_24', 2024, 2, { expenses: [tx('Edeka', 100)] })
    const m3 = month('MAR_24', 2024, 3, { expenses: [tx('Edeka', 100)] })
    const m4 = month('APR_24', 2024, 4, { expenses: [tx('Edeka', 250)] }) // latest, spike
    const movers = topMovers([m1, m2, m3, m4], {}, 3)
    const groceries = movers.find((mv) => mv.category === 'groceries')!
    expect(groceries.current).toBe(250)
    expect(groceries.trailingAvg).toBe(100)
    expect(groceries.deltaEUR).toBe(150)
    expect(groceries.deltaPct).toBe(150)
  })

  it('excludes movers below the 20 EUR minimum delta', () => {
    const m1 = month('JAN_24', 2024, 1, { expenses: [tx('Edeka', 100)] })
    const m2 = month('FEB_24', 2024, 2, { expenses: [tx('Edeka', 110)] }) // latest, +10 only
    const movers = topMovers([m1, m2], {}, 3)
    expect(movers.find((mv) => mv.category === 'groceries')).toBeUndefined()
  })

  it('includes a category that dropped to zero in the latest month (was present in trailing window)', () => {
    const m1 = month('JAN_24', 2024, 1, { expenses: [tx('Edeka', 200)] })
    const m2 = month('FEB_24', 2024, 2, { expenses: [] }) // latest — groceries vanished
    const movers = topMovers([m1, m2], {}, 3)
    const groceries = movers.find((mv) => mv.category === 'groceries')!
    expect(groceries.current).toBe(0)
    expect(groceries.trailingAvg).toBe(200)
    expect(groceries.deltaEUR).toBe(-200)
  })

  it('sorts by |deltaEUR| descending and caps at 8 movers', () => {
    const prior = month('JAN_24', 2024, 1, { expenses: [] })
    const latestExpenses: Tx[] = []
    // 10 distinct uncategorized labels -> 10 distinct categories fall to 'uncategorized' bucket (same
    // category!), so instead use overrides to force 10 distinct categories with distinct deltas.
    const overrides: Record<string, string> = {}
    for (let i = 0; i < 10; i++) {
      const label = `shop${i}`
      overrides[label] = `cat${i}`
      latestExpenses.push(tx(label, 30 + i * 10)) // deltas: 30,40,...,120 (all >= 20 EUR vs trailing 0)
    }
    const latest = month('FEB_24', 2024, 2, { expenses: latestExpenses })
    const movers = topMovers([prior, latest], overrides, 3)
    expect(movers).toHaveLength(8)
    // Largest delta first (cat9: 120), then descending.
    expect(movers[0].category).toBe('cat9')
    expect(movers[0].deltaEUR).toBe(120)
    const deltas = movers.map((mv) => mv.deltaEUR)
    expect(deltas).toEqual([...deltas].sort((a, b) => b - a))
  })

  it('handles an empty months list', () => {
    expect(topMovers([], {}, 3)).toEqual([])
  })

  it('single month: trailingAvg is 0 (no history), deltaPct null', () => {
    const m = month('JAN_24', 2024, 1, { expenses: [tx('Edeka', 100)] })
    const movers = topMovers([m], {}, 3)
    const groceries = movers.find((mv) => mv.category === 'groceries')!
    expect(groceries.trailingAvg).toBe(0)
    expect(groceries.current).toBe(100)
    expect(groceries.deltaPct).toBeNull()
  })
})

describe('householdSplit', () => {
  it('splits expense totals per month into household vs other', () => {
    const m = month('JAN_24', 2024, 1, {
      expenses: [
        tx('Sachin', 50, { household: true }),
        tx('Rent', 800, { household: false }),
      ],
    })
    expect(householdSplit([m])).toEqual([{ tab: 'JAN_24', household: 50, other: 800 }])
  })

  it('sorts defensively by period', () => {
    const m1 = month('JAN_24', 2024, 1)
    const m2 = month('FEB_24', 2024, 2)
    expect(householdSplit([m2, m1]).map((p) => p.tab)).toEqual(['JAN_24', 'FEB_24'])
  })

  it('handles an empty months list', () => {
    expect(householdSplit([])).toEqual([])
  })
})
