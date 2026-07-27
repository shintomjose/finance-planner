import { describe, expect, it } from 'vitest'
import { cardDues, duesTotal, isCardStatementUpcoming, isDueCoveredUpcoming } from '../src/lib/cardDues'
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

describe('isCardStatementUpcoming', () => {
  it('drops the statement rows', () => {
    expect(isCardStatementUpcoming('Advancia Credit Card')).toBe(true)
    expect(isCardStatementUpcoming('Amazon CC')).toBe(true) // alias → sparkasse
    expect(isCardStatementUpcoming('Amex')).toBe(true)
    expect(isCardStatementUpcoming('Advanzia')).toBe(true)
  })

  it('keeps real bills that merely mention a card/provider', () => {
    expect(isCardStatementUpcoming('Amex Netto')).toBe(false)
    expect(isCardStatementUpcoming('Advanzia Add')).toBe(false)
    expect(isCardStatementUpcoming('Sparkasse Interest')).toBe(false)
    expect(isCardStatementUpcoming('Amazon Prime')).toBe(false)
    expect(isCardStatementUpcoming('Rent')).toBe(false)
    expect(isCardStatementUpcoming('Food Home')).toBe(false)
  })

  it('"Amazon Bill" (FIXED service label) and "ICICI BILL" are never treated as card statements', () => {
    expect(isCardStatementUpcoming('Amazon Bill')).toBe(false)
    expect(isCardStatementUpcoming('ICICI BILL')).toBe(false)
  })
})

describe('isDueCoveredUpcoming', () => {
  it('drops the bare Sachin row (duplicates the computed due) plus all statement rows', () => {
    expect(isDueCoveredUpcoming('Sachin')).toBe(true)
    expect(isDueCoveredUpcoming('SACHIN')).toBe(true)
    expect(isDueCoveredUpcoming('Amazon CC')).toBe(true)
    expect(isDueCoveredUpcoming('Sachin swe')).toBe(false) // extra words = a different row
    expect(isDueCoveredUpcoming('Rent')).toBe(false)
  })
})
