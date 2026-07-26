import { describe, it, expect } from 'vitest'
import { partitionUpcoming, foodHomeRemainingFor } from '../src/lib/foodHome'
import type { MonthData, UpcomingItem } from '../src/types'

const item = (name: string, total: number | null, toPay: number | null): UpcomingItem => ({ name, total, toPay })

describe('partitionUpcoming', () => {
  it('splits out the "Food Home" row (case/whitespace-insensitive) from the payable bills', () => {
    const upcoming = [item('Rent', 850, 850), item('Food Home', 700, 320.5), item('Gym', 43, 43)]
    const { bills, foodHomeRemaining } = partitionUpcoming(upcoming)
    expect(bills.map((b) => b.name)).toEqual(['Rent', 'Gym'])
    expect(foodHomeRemaining).toBe(320.5)
  })

  it('matches "food home" case-insensitively and trims whitespace', () => {
    const upcoming = [item('  FOOD   HOME ', 700, 100)]
    const { bills, foodHomeRemaining } = partitionUpcoming(upcoming)
    expect(bills).toEqual([])
    expect(foodHomeRemaining).toBe(100)
  })

  it('returns foodHomeRemaining null and all rows as bills when no food-home row is present', () => {
    const upcoming = [item('Rent', 850, 850)]
    const { bills, foodHomeRemaining } = partitionUpcoming(upcoming)
    expect(bills).toEqual(upcoming)
    expect(foodHomeRemaining).toBeNull()
  })

  it('handles an empty upcoming list', () => {
    expect(partitionUpcoming([])).toEqual({ bills: [], foodHomeRemaining: null })
  })
})

describe('foodHomeRemainingFor', () => {
  const month = (upcoming: UpcomingItem[]): MonthData => ({
    tab: 'JUN_25',
    period: { year: 2025, month: 6 },
    era: 'v2025',
    income: [],
    expenses: [],
    carryover: null,
    summary: { totalIncome: null, totalExpense: null, balance: null, household: null },
    banks: [],
    bankTotal: null,
    expectedActual: null,
    balanceAfterFuture: null,
    upcoming,
    issues: [],
  })

  it('returns the food-home toPay for the given month', () => {
    expect(foodHomeRemainingFor(month([item('Food Home', 700, 250)]))).toBe(250)
  })

  it('returns null when the month has no food-home upcoming row', () => {
    expect(foodHomeRemainingFor(month([item('Rent', 850, 850)]))).toBeNull()
  })

  it('returns null when no month is selected', () => {
    expect(foodHomeRemainingFor(undefined)).toBeNull()
  })
})
