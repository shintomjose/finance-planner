import { describe, expect, it } from 'vitest'
import { upcomingIncome } from '../src/lib/upcomingIncome'
import { normLabel } from '../src/lib/normalize'
import type { MonthData, ScratchEntry } from '../src/types'

const s = (label: string, amountEUR: number, row: number, block: 'IJ' | 'KL' = 'KL'): ScratchEntry => ({
  label, normLabel: normLabel(label), amountEUR, block, row,
})

function month(scratch: ScratchEntry[]): MonthData {
  return {
    tab: 'JUL_26', period: { year: 2026, month: 7 }, era: 'v2025',
    income: [], expenses: [], carryover: null,
    summary: { totalIncome: null, totalExpense: null, balance: null, household: null },
    banks: [], bankTotal: null, expectedActual: null, balanceAfterFuture: null,
    upcoming: [], issues: [], scratch,
  }
}

// JUL_26-shaped forecast block (synthetic values): BALANCE/MINUS EXP anchor,
// income rows between, TOTAL end; blank rows (KG+EG etc.) simply absent
// because scratch only captures numeric cells.
const BLOCK: ScratchEntry[] = [
  s('BALANCE', 1650, 15),
  s('MINUS EXP', -500.25, 16),
  s('SACHIN', 900.6, 18),
  s('CRIS', 120, 19),
  s('Salary', 4405, 21),
  s('TOTAL', -300.4, 22),
  s('ICICI-5004', 0, 25),
  s('TOTAL', 0, 27),
]

describe('upcomingIncome', () => {
  it('extracts the rows between the MINUS EXP anchor and the first TOTAL, summing them itself', () => {
    const r = upcomingIncome(month(BLOCK))!
    expect(r.items).toEqual([
      { label: 'SACHIN', amountEUR: 900.6 },
      { label: 'CRIS', amountEUR: 120 },
      { label: 'Salary', amountEUR: 4405 },
    ])
    expect(r.total).toBe(5425.6) // NOT the sheet's own TOTAL (-300.4, a forecast figure)
  })

  it('a second TOTAL further down (ICICI sub-block) never extends the range', () => {
    const r = upcomingIncome(month(BLOCK))!
    expect(r.items.some((i) => i.label.startsWith('ICICI'))).toBe(false)
  })

  it('BALANCE alone anchors when MINUS EXP is blank that month', () => {
    const r = upcomingIncome(month([s('BALANCE', 1650, 15), s('SACHIN', 900.6, 18), s('TOTAL', 900.6, 22)]))!
    expect(r.items).toEqual([{ label: 'SACHIN', amountEUR: 900.6 }])
  })

  it('a second unrelated BALANCE further down (FED/INR sub-block) never hijacks the anchor (live-run bug)', () => {
    const r = upcomingIncome(month([
      ...BLOCK,
      s('FED', 4397.16, 35),
      s('BALANCE', 10313.52, 43), // the live JUL_26 shape that broke the max-anchor version
    ]))!
    expect(r.items.map((i) => i.label)).toEqual(['SACHIN', 'CRIS', 'Salary'])
  })

  it('no anchor or no TOTAL → null (block absent), not an empty result', () => {
    expect(upcomingIncome(month([]))).toBeNull()
    expect(upcomingIncome(month([s('SACHIN', 900.6, 18)]))).toBeNull()
    expect(upcomingIncome(month([s('MINUS EXP', -1, 16), s('SACHIN', 900.6, 18)]))).toBeNull()
  })

  it('block present but every income row blank → empty items, total 0', () => {
    const r = upcomingIncome(month([s('MINUS EXP', -1, 16), s('TOTAL', -1, 22)]))!
    expect(r.items).toEqual([])
    expect(r.total).toBe(0)
  })

  it('IJ entries never leak into the K/L block scan', () => {
    const r = upcomingIncome(month([s('MINUS EXP', -1, 16), s('Sachin', 418, 17, 'IJ'), s('TOTAL', -1, 22)]))!
    expect(r.items).toEqual([])
  })
})
