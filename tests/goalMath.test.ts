import { describe, it, expect } from 'vitest'
import { goalFeasibility, uncategorizedRanking } from '../src/lib/goalMath'
import type { Goal } from '../src/state/appState'
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

const goal = (opts: Partial<Goal> = {}): Goal => ({
  id: 'g1',
  name: 'Emergency fund',
  targetEUR: 6000,
  ...opts,
})

describe('goalFeasibility — avgFreeCashFlow', () => {
  it('averages net (income-expense) over the trailing window, excluding the current partial month', () => {
    // Jan..Aug 2024, "now" is inside Aug (current, partial) -> excluded.
    // Net per month: Jan..Jul all net = 1000 (income 2000, expense 1000); Aug net = 9999 (must be excluded).
    const months: MonthData[] = []
    for (let m = 1; m <= 7; m++) {
      months.push(
        month(`M${m}`, 2024, m, {
          income: [tx('Salary', 2000, { kind: 'income' })],
          expenses: [tx('Rent', 1000)],
        }),
      )
    }
    months.push(month('AUG', 2024, 8, { income: [tx('Salary', 20000, { kind: 'income' })], expenses: [] }))
    const now = new Date(2024, 7, 15) // Aug 15 2024
    const [result] = goalFeasibility([goal()], months, now, 6)
    // trailing 6 of the 7 non-current months (Feb..Jul) -> all net 1000
    expect(result.avgFreeCashFlow).toBe(1000)
  })

  it('averages over however many trailing months are available when fewer than the window', () => {
    const months = [
      month('JAN', 2024, 1, { income: [tx('Salary', 1500, { kind: 'income' })], expenses: [tx('Rent', 1000)] }),
      month('FEB', 2024, 2, { income: [tx('Salary', 1700, { kind: 'income' })], expenses: [tx('Rent', 1000)] }),
    ]
    const now = new Date(2024, 2, 10) // March — neither Jan nor Feb is "current"
    const [result] = goalFeasibility([goal()], months, now, 6)
    // net: Jan 500, Feb 700 -> avg 600
    expect(result.avgFreeCashFlow).toBe(600)
  })

  it('is 0 when there is no trailing history at all', () => {
    const now = new Date(2024, 2, 10)
    const [result] = goalFeasibility([goal()], [], now, 6)
    expect(result.avgFreeCashFlow).toBe(0)
  })
})

describe('goalFeasibility — monthsRemaining / requiredPerMonth / feasible', () => {
  it('is null across the board when the goal has no targetDate', () => {
    const now = new Date(2024, 2, 10)
    const [result] = goalFeasibility([goal({ targetEUR: 1000 })], [], now, 6)
    expect(result.monthsRemaining).toBeNull()
    expect(result.requiredPerMonth).toBeNull()
    expect(result.feasible).toBeNull()
  })

  it('computes monthsRemaining and requiredPerMonth for a future targetDate, feasible=true when within cash flow', () => {
    const months = [month('JAN', 2024, 1, { income: [tx('Salary', 2000, { kind: 'income' })], expenses: [tx('Rent', 1000)] })]
    const now = new Date(2024, 1, 1) // Feb 1 2024
    const target = goal({ targetEUR: 3000, currentEUR: 0, targetDate: '2024-05-01' }) // ~3 months out
    const [result] = goalFeasibility([target], months, now, 6)
    expect(result.monthsRemaining).toBe(3)
    expect(result.requiredPerMonth).toBe(1000)
    expect(result.avgFreeCashFlow).toBe(1000)
    expect(result.feasible).toBe(true)
  })

  it('feasible=false when requiredPerMonth exceeds avgFreeCashFlow', () => {
    const months = [month('JAN', 2024, 1, { income: [tx('Salary', 1500, { kind: 'income' })], expenses: [tx('Rent', 1000)] })]
    const now = new Date(2024, 1, 1)
    const target = goal({ targetEUR: 3000, currentEUR: 0, targetDate: '2024-05-01' })
    const [result] = goalFeasibility([target], months, now, 6)
    expect(result.requiredPerMonth).toBe(1000)
    expect(result.avgFreeCashFlow).toBe(500)
    expect(result.feasible).toBe(false)
  })

  it('subtracts currentEUR already saved from the required amount', () => {
    const now = new Date(2024, 1, 1)
    const target = goal({ targetEUR: 3000, currentEUR: 1500, targetDate: '2024-05-01' })
    const [result] = goalFeasibility([target], [], now, 6)
    expect(result.requiredPerMonth).toBe(500)
  })

  it('requiredPerMonth and feasible are null when the target date has already passed (monthsRemaining <= 0)', () => {
    const now = new Date(2024, 5, 1) // June 1
    const target = goal({ targetEUR: 3000, targetDate: '2024-01-01' })
    const [result] = goalFeasibility([target], [], now, 6)
    expect(result.monthsRemaining).toBeLessThanOrEqual(0)
    expect(result.requiredPerMonth).toBeNull()
    expect(result.feasible).toBeNull()
  })
})

describe('goalFeasibility — progressPct', () => {
  it('is (currentEUR / targetEUR) * 100', () => {
    const now = new Date(2024, 1, 1)
    const [result] = goalFeasibility([goal({ targetEUR: 1000, currentEUR: 250 })], [], now, 6)
    expect(result.progressPct).toBe(25)
  })

  it('is 0 when currentEUR is absent', () => {
    const now = new Date(2024, 1, 1)
    const [result] = goalFeasibility([goal({ targetEUR: 1000 })], [], now, 6)
    expect(result.progressPct).toBe(0)
  })

  it('clamps at 100 when currentEUR exceeds targetEUR', () => {
    const now = new Date(2024, 1, 1)
    const [result] = goalFeasibility([goal({ targetEUR: 1000, currentEUR: 5000 })], [], now, 6)
    expect(result.progressPct).toBe(100)
  })
})

describe('goalFeasibility — multiple goals', () => {
  it('returns one result per goal, in the same order, each carrying its own goalId', () => {
    const now = new Date(2024, 1, 1)
    const goals = [goal({ id: 'a' }), goal({ id: 'b' }), goal({ id: 'c' })]
    const results = goalFeasibility(goals, [], now, 6)
    expect(results.map((r) => r.goalId)).toEqual(['a', 'b', 'c'])
  })

  it('handles an empty goals list', () => {
    expect(goalFeasibility([], [], new Date(2024, 1, 1), 6)).toEqual([])
  })
})

describe('uncategorizedRanking', () => {
  const tx2 = (label: string, amountEUR: number): Tx => tx(label, amountEUR)

  it('groups uncategorized expenses by normLabel, counting hits and summing EUR', () => {
    const m = month('JAN', 2024, 1, {
      expenses: [tx2('Mystery Shop', 40), tx2('Mystery Shop', 10), tx2('Edeka', 100)], // Edeka is seeded (groceries)
    })
    const ranking = uncategorizedRanking([m], {})
    expect(ranking).toEqual([{ normLabel: 'mystery shop', count: 2, totalEUR: 50 }])
  })

  it('excludes labels that resolve to a real category via overrides', () => {
    const m = month('JAN', 2024, 1, { expenses: [tx2('Mystery Shop', 40)] })
    const ranking = uncategorizedRanking([m], { 'mystery shop': 'groceries' })
    expect(ranking).toEqual([])
  })

  it('sorts by count descending, tie-broken by normLabel ascending', () => {
    const m = month('JAN', 2024, 1, {
      expenses: [tx2('Zeta', 10), tx2('Alpha', 10), tx2('Beta', 20), tx2('Beta', 5)],
    })
    const ranking = uncategorizedRanking([m], {})
    expect(ranking.map((r) => r.normLabel)).toEqual(['beta', 'alpha', 'zeta'])
  })

  it('caps at topN (default 20)', () => {
    const expenses: Tx[] = []
    for (let i = 0; i < 25; i++) expenses.push(tx2(`shop${i}`, 10))
    const m = month('JAN', 2024, 1, { expenses })
    expect(uncategorizedRanking([m], {})).toHaveLength(20)
    expect(uncategorizedRanking([m], {}, 5)).toHaveLength(5)
  })

  it('handles an empty months list', () => {
    expect(uncategorizedRanking([], {})).toEqual([])
  })
})
