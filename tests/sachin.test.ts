import { describe, it, expect } from 'vitest'
import { parseSachin } from '../src/parse/sachin'
import fixture from './fixtures/SACHIN.json'
import type { SpecialGrids } from '../src/data/specialTabs'

const grids = fixture as SpecialGrids
const result = parseSachin(grids)
const { ledger, issues } = result

describe('given ledger (B2:C336, label-driven; dates col A only from ~row 122)', () => {
  it('parses 15 given entries total (9 early, no date + 6 late, with date)', () => {
    expect(ledger.entries).toHaveLength(15)
  })

  it('early entries (rows 2-10, before ~122) have date: null and NO issue when A is genuinely blank', () => {
    const early = ledger.entries.filter((e) => e.row < 122)
    expect(early).toHaveLength(9)
    expect(early.every((e) => e.date === null)).toBe(true)
    expect(early[0]).toEqual({ date: null, label: 'Cash for rent', amountEUR: 500, row: 2 })
  })

  it('planted non-blank bad date at A6 (before row 122) -> bad-date issue, entry kept with date: null', () => {
    const row = ledger.entries.find((e) => e.row === 6)
    expect(row).toEqual({ date: null, label: 'Travel advance', amountEUR: 400, row: 6 })
    expect(issues).toContainEqual({
      sheet: 'SACHIN', cell: 'A6', kind: 'bad-date',
      detail: expect.stringContaining('40-13-2024'), raw: '40-13-2024',
    })
  })

  it('late entries (rows 122+) carry a real date', () => {
    const late = ledger.entries.filter((e) => e.row >= 122)
    expect(late).toHaveLength(6)
    expect(late[0]).toEqual({ date: '2024-03-01', label: 'Rent support', amountEUR: 600, row: 122 })
  })
})

describe('repayments (F133:G189, real layout: F=label, G=amount, no dates — live-run correction #14)', () => {
  it('parses 8 repayment rows, every one with date: null', () => {
    expect(ledger.repayments).toHaveLength(8)
    expect(ledger.repayments.every((r) => r.date === null)).toBe(true)
  })

  it('first repayment uses F as the label', () => {
    expect(ledger.repayments[0]).toEqual({ date: null, label: 'Rent installment', amountEUR: 300, row: 133 })
  })

  it('planted bad-number at G135 -> bad-number issue, row kept with amountEUR: null, label still read from F', () => {
    const row = ledger.repayments.find((r) => r.row === 135)
    expect(row).toEqual({ date: null, label: 'Books refund', amountEUR: null, row: 135 })
    expect(issues).toContainEqual({
      sheet: 'SACHIN', cell: 'G135', kind: 'bad-number',
      detail: expect.stringContaining('N/A'), raw: 'N/A',
    })
  })
})

describe('EMI blocks located by header label in col H (fixture offsets +2 vs map: H5/H29/H45/H59)', () => {
  it('finds all 4 EMI blocks by label, not by the map\'s fixed rows', () => {
    expect(ledger.emis.map((e) => e.name)).toEqual(['iPhone-13', 'iPhone 14', 'Fridge', 'Washing Machine'])
  })

  it('iPhone-13 block (header H5): 4 installment rows', () => {
    const emi = ledger.emis.find((e) => e.name === 'iPhone-13')!
    expect(emi.rows).toHaveLength(4)
    expect(emi.rows[0]).toEqual({ date: null, label: 'EMI 1', amountEUR: 45, row: 6 })
  })

  it('iPhone 14 block (header H29): 5 installment rows', () => {
    const emi = ledger.emis.find((e) => e.name === 'iPhone 14')!
    expect(emi.rows).toHaveLength(5)
  })

  it('Fridge block (header H45): 3 installment rows', () => {
    const emi = ledger.emis.find((e) => e.name === 'Fridge')!
    expect(emi.rows).toHaveLength(3)
  })

  it('Washing Machine block (header H59): 4 installment rows', () => {
    const emi = ledger.emis.find((e) => e.name === 'Washing Machine')!
    expect(emi.rows).toHaveLength(4)
  })
})

describe('totals (given/repaid recomputed; remaining sheet-trusted — live-run correction #15)', () => {
  it('given and repaid are the recomputed sums; remaining is read directly from G132', () => {
    expect(ledger.totals).toEqual({ given: 4400, repaid: 940, remaining: 5000 })
  })

  it('planted small sum-drift on G131 (given total: sheet 4400.05 vs recomputed 4400)', () => {
    expect(issues).toContainEqual({
      sheet: 'SACHIN', cell: 'G131', kind: 'sum-drift',
      detail: expect.stringContaining('4400.05'),
    })
  })

  it('planted small sum-drift on G190 (repayments total: sheet 940.05 vs recomputed 940)', () => {
    expect(issues).toContainEqual({
      sheet: 'SACHIN', cell: 'G190', kind: 'sum-drift',
      detail: expect.stringContaining('940.05'),
    })
  })

  it('G132 (remaining) is planted FAR from the given-repaid recompute (5000 vs 3460) yet emits NO sum-drift — it is trusted as-is, never cross-checked', () => {
    expect(issues.some((i) => i.cell === 'G132')).toBe(false)
  })
})

describe('inline repayments-total footer (owner correction 2026-07-31: the live total sits INSIDE F133:G189)', () => {
  // Minimal synthetic grid builder: A1-based sparse 2D array, F=index 5, G=index 6.
  function grid(rows: Record<number, [string | null, number | string | null]>): SpecialGrids {
    const values: (string | number | null)[][] = []
    for (const [rowStr, [f, g]] of Object.entries(rows)) {
      const r = Number(rowStr) - 1
      values[r] = []
      values[r][5] = f
      values[r][6] = g
    }
    return { values } as SpecialGrids
  }

  it('a "Total"-labelled row is excluded from the ledger and used as the sheet total (no drift when it matches)', () => {
    const { ledger, issues } = parseSachin(grid({ 133: ['A', 300], 134: ['B', 340], 140: ['Total', 640] }))
    expect(ledger.repayments.map((r) => r.row)).toEqual([133, 134])
    expect(ledger.totals.repaid).toBe(640)
    expect(issues.filter((i) => i.kind === 'sum-drift')).toHaveLength(0)
  })

  it('a "Total"-labelled row that does NOT match the recomputed sum emits sum-drift at ITS cell, not G190', () => {
    const { issues } = parseSachin(grid({ 133: ['A', 300], 134: ['B', 340], 140: ['Total Repayment', 700] }))
    expect(issues).toContainEqual(expect.objectContaining({ cell: 'G140', kind: 'sum-drift' }))
  })

  it('an unlabelled LAST row equal to the sum of the rest is the footer — excluded, no double count', () => {
    // The live bug: blank F on the footer row rendered as "Repayment REDACTED,00 €".
    const { ledger, issues } = parseSachin(grid({ 133: ['A', 300], 134: ['B', 340], 150: [null, 640] }))
    expect(ledger.repayments.map((r) => r.row)).toEqual([133, 134])
    expect(ledger.totals.repaid).toBe(640)
    expect(issues.filter((i) => i.kind === 'sum-drift')).toHaveLength(0)
  })

  it('a last row that is a REAL repayment (not equal to the rest-sum) stays in the ledger', () => {
    const { ledger } = parseSachin(grid({ 133: ['A', 300], 134: ['B', 340], 150: [null, 500] }))
    expect(ledger.repayments).toHaveLength(3)
    expect(ledger.totals.repaid).toBe(1140)
  })

  it('a lone repayment row never matches itself as a footer', () => {
    const { ledger } = parseSachin(grid({ 133: [null, 250] }))
    expect(ledger.repayments).toHaveLength(1)
    expect(ledger.totals.repaid).toBe(250)
  })
})

describe('ledger name', () => {
  it('is Sachin', () => {
    expect(ledger.name).toBe('Sachin')
  })
})

describe('overall issue set', () => {
  it('contains exactly the 4 planted issue-worthy cells — no stray drops', () => {
    const kinds = issues.map((i) => `${i.kind}@${i.cell}`).sort()
    expect(kinds).toEqual(['bad-date@A6', 'bad-number@G135', 'sum-drift@G131', 'sum-drift@G190'])
  })
})
