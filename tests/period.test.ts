import { describe, it, expect } from 'vitest'
import { tabToPeriod, eraOf, isMonthTab, currentTabName, pickDisplayedMonth } from '../src/lib/period'
import type { MonthData } from '../src/types'

const stubMonth = (tab: string): MonthData => ({
  tab,
  period: { year: 2000, month: 1 },
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
})

describe('tabToPeriod', () => {
  it('bare month name = 2019', () => expect(tabToPeriod('JAN')).toEqual({ year: 2019, month: 1 }))
  it('MMM_YY', () => expect(tabToPeriod('OCT_24')).toEqual({ year: 2024, month: 10 }))
  it('non-month tab', () => expect(tabToPeriod('MONTHLY_PLAN')).toBeNull())
})
describe('eraOf', () => {
  it('2019 v1 = JAN–MAY', () => expect(eraOf({ year: 2019, month: 5 })).toBe('2019v1'))
  it('2019 v2 = JUN–DEC', () => expect(eraOf({ year: 2019, month: 6 })).toBe('2019v2'))
  it('full = JAN_20–OCT_24', () => expect(eraOf({ year: 2024, month: 10 })).toBe('full'))
  it('v2025 = NOV_24+', () => expect(eraOf({ year: 2024, month: 11 })).toBe('v2025'))
})
it('isMonthTab', () => { expect(isMonthTab('FEB_21')).toBe(true); expect(isMonthTab('SACHIN')).toBe(false) })
it('currentTabName', () => expect(currentTabName(new Date(2026, 6, 24))).toBe('JUL_26'))
describe('pickDisplayedMonth', () => {
  const now = new Date(2026, 6, 24) // JUL_26
  it('prefers the current-month tab when present', () => {
    const months = [stubMonth('JUN_26'), stubMonth('JUL_26')]
    expect(pickDisplayedMonth(months, now)?.tab).toBe('JUL_26')
  })
  it('falls back to the latest month when current-month tab is missing', () => {
    const months = [stubMonth('MAY_26'), stubMonth('JUN_26')]
    expect(pickDisplayedMonth(months, now)?.tab).toBe('JUN_26')
  })
  it('returns undefined for an empty list', () => {
    expect(pickDisplayedMonth([], now)).toBeUndefined()
  })
})
