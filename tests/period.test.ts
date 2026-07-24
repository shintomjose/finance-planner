import { describe, it, expect } from 'vitest'
import { tabToPeriod, eraOf, isMonthTab, currentTabName } from '../src/lib/period'

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
