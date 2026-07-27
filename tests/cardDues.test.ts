import { describe, expect, it } from 'vitest'
import { cardDues, duesTotal, isDueCoveredUpcoming } from '../src/lib/cardDues'
import { normLabel } from '../src/lib/normalize'
import type { MonthData, ScratchEntry, Tx } from '../src/types'

let row = 0
function tx(label: string, amountEUR: number | null): Tx {
  return { tab: 'T', row: ++row, label, normLabel: normLabel(label), amountEUR, kind: 'expense', planned: amountEUR === null, household: false }
}

function month(scratch: ScratchEntry[], expenses: Tx[] = []): MonthData {
  return {
    tab: 'JUL_26', period: { year: 2026, month: 7 }, era: 'v2025',
    income: [], expenses, carryover: null,
    summary: { totalIncome: null, totalExpense: null, balance: null, household: null },
    banks: [], bankTotal: null, expectedActual: null, balanceAfterFuture: null,
    upcoming: [], issues: [], scratch,
  }
}

const s = (label: string, amountEUR: number, block: 'IJ' | 'KL', r = 10): ScratchEntry => ({
  label, normLabel: normLabel(label), amountEUR, block, row: r,
})

// JUL_26-SHAPED scratch (labels/blocks mirror the live layout; every amount
// is SYNTHETIC — repo golden rule: no real financial data).
const SCRATCH: ScratchEntry[] = [
  s('Current Amazon', 320.5, 'IJ', 13),
  s('Current Advancia', 1500.75, 'IJ', 14),
  s('Amex', 210.4, 'IJ', 17),
  s('Sachin', 80.25, 'IJ', 18),
  s('SACHIN', 900.6, 'KL', 18),
]

describe('cardDues', () => {
  it('card dues = scratch balances AS-IS (owner: payments already deducted in the sheet); payments are note-only', () => {
    const m = month(SCRATCH, [tx('Advancia CC', 400), tx('Amazon CC', 50), tx('Amex CC', 300)])
    const dues = cardDues(m)
    expect(dues).toHaveLength(3) // Sachin due removed entirely (owner: formula was wrong; income side now)
    expect(dues.find((d) => d.key === 'advanzia')!.due).toBe(1500.75) // J14 as-is, NOT minus 400
    expect(dues.find((d) => d.key === 'sparkasse')!.due).toBe(320.5)
    expect(dues.find((d) => d.key === 'amex')!.due).toBe(210.4)
    expect(dues.find((d) => d.key === 'advanzia')!.note).toContain('400,00') // paid shown as a line
  })

  it('missing scratch figure → null due with an explanatory note, never 0', () => {
    const dues = cardDues(month([]))
    expect(dues).toHaveLength(3)
    for (const d of dues) {
      expect(d.due).toBeNull()
      expect(d.note.length).toBeGreaterThan(0)
    }
  })

  it('no payment row yet → balance due with a "nothing paid" note', () => {
    const dues = cardDues(month(SCRATCH))
    expect(dues.find((d) => d.key === 'advanzia')!.due).toBe(1500.75)
    expect(dues.find((d) => d.key === 'advanzia')!.note).toContain('nothing paid')
  })

  it('"upcoming amex" scratch row never mistaken for the Amex balance (exact match)', () => {
    const dues = cardDues(month([s('Upcoming Amex', 999, 'IJ')]))
    expect(dues.find((d) => d.key === 'amex')!.due).toBeNull()
  })

  it('multiple payment rows for one card are summed in the note (due untouched)', () => {
    const m = month(SCRATCH, [tx('Advancia CC', 1000), tx('Advanzia', 200)])
    const row = cardDues(m).find((d) => d.key === 'advanzia')!
    expect(row.due).toBe(1500.75)
    expect(row.note).toContain('1.200,00')
  })

  it('duesTotal ignores null rows', () => {
    const dues = cardDues(month([s('Current Amazon', 100, 'IJ')]))
    expect(duesTotal(dues)).toBe(100)
  })
})

describe('isDueCoveredUpcoming', () => {
  it('drops EVERY card-charged row — the statement dues already include all pending charges (owner)', () => {
    expect(isDueCoveredUpcoming('Advancia Credit Card')).toBe(true)
    expect(isDueCoveredUpcoming('Amazon CC')).toBe(true) // alias → sparkasse
    expect(isDueCoveredUpcoming('Amex')).toBe(true)
    expect(isDueCoveredUpcoming('Advanzia')).toBe(true)
    expect(isDueCoveredUpcoming('Amex Netto')).toBe(true)
    expect(isDueCoveredUpcoming('Advanzia Add')).toBe(true)
    expect(isDueCoveredUpcoming('Sparkasse Interest')).toBe(true)
    expect(isDueCoveredUpcoming('Amazon Prime')).toBe(true)
    expect(isDueCoveredUpcoming('Amazon Bill')).toBe(true)
  })

  it('drops the bare Sachin row (income expectation, not an expense)', () => {
    expect(isDueCoveredUpcoming('Sachin')).toBe(true)
    expect(isDueCoveredUpcoming('SACHIN')).toBe(true)
    expect(isDueCoveredUpcoming('Sachin swe')).toBe(false) // extra words = a different row
  })

  it('keeps genuine non-card bills', () => {
    expect(isDueCoveredUpcoming('Rent')).toBe(false)
    expect(isDueCoveredUpcoming('Food Home')).toBe(false)
    expect(isDueCoveredUpcoming('Commerzbank EMI')).toBe(false)
    expect(isDueCoveredUpcoming('ICICI BILL')).toBe(false)
  })
})
