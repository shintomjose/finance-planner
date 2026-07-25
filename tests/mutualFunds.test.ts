import { describe, it, expect } from 'vitest'
import { parseMutualFunds } from '../src/parse/mutualFunds'
import fixture from './fixtures/MUTUAL_FUNDS.json'
import type { SpecialGrids } from '../src/data/specialTabs'

const grids = fixture as SpecialGrids
const result = parseMutualFunds(grids)

function snapshotsFor(asset: string) {
  return result.snapshots.filter((s) => s.asset === asset)
}

describe('Quant Small Cap Fund (SIP, B/C/D) — date/amount/current-value', () => {
  const rows = snapshotsFor('Quant Small Cap Fund')

  it('parses 8 real installment rows (row 8 is pure scaffold, skipped)', () => {
    expect(rows).toHaveLength(8)
  })

  it('first row: date, invested, current value all populated', () => {
    expect(rows[0]).toEqual({
      date: '2025-01-05', source: 'mf', asset: 'Quant Small Cap Fund',
      investedINR: 2000, valueINR: 2000,
    })
  })

  it('planted bad date at B6 -> bad-date issue, row kept with date: null, other fields intact', () => {
    const badRow = rows.find((r) => r.valueINR === 10500)
    expect(badRow).toEqual({
      date: null, source: 'mf', asset: 'Quant Small Cap Fund',
      investedINR: 2000, valueINR: 10500,
    })
    expect(result.issues).toContainEqual({
      sheet: 'MUTUAL FUNDS', cell: 'B6', kind: 'bad-date',
      detail: expect.stringContaining('13-13-2025'), raw: '13-13-2025',
    })
  })

  it('row 8 (pure scaffold: A8 has running number, B8:D8 blank) produces no snapshot and no issue', () => {
    expect(rows.some((r) => r.date === null && r.investedINR === null)).toBe(false)
    expect(result.issues.find((i) => i.cell?.endsWith('8'))).toBeUndefined()
  })
})

describe('JM Flexicap Fund (SIP, E/F/G)', () => {
  const rows = snapshotsFor('JM Flexicap Fund')

  it('parses 8 real installment rows', () => {
    expect(rows).toHaveLength(8)
  })

  it('planted bad-number at F5 ("5,000") -> issue, row kept with investedINR left undefined', () => {
    const badRow = rows.find((r) => r.valueINR === 20800)
    expect(badRow).toEqual({
      date: '2025-04-10', source: 'mf', asset: 'JM Flexicap Fund', valueINR: 20800,
    })
    expect(badRow?.investedINR).toBeUndefined()
    expect(result.issues).toContainEqual({
      sheet: 'MUTUAL FUNDS', cell: 'F5', kind: 'bad-number',
      detail: expect.stringContaining('5,000'), raw: '5,000',
    })
  })
})

describe('PGIM India Midcap Opportunities Fund (SIP, H/I/J)', () => {
  const rows = snapshotsFor('PGIM India Midcap Opportunities Fund')

  it('parses 6 real installment rows', () => {
    expect(rows).toHaveLength(6)
  })

  it('planted #REF! at I5 -> ref-error issue, row kept with investedINR left undefined', () => {
    const badRow = rows.find((r) => r.valueINR === 12400)
    expect(badRow).toEqual({
      date: '2025-04-12', source: 'mf', asset: 'PGIM India Midcap Opportunities Fund', valueINR: 12400,
    })
    expect(badRow?.investedINR).toBeUndefined()
    expect(result.issues).toContainEqual({
      sheet: 'MUTUAL FUNDS', cell: 'I5', kind: 'ref-error',
      detail: expect.stringContaining('#REF!'), raw: '#REF!',
    })
  })
})

describe('360 ONE Focused Equity Fund (lump/valuation, K/L)', () => {
  it('parses 4 date/value snapshots, no investedINR field', () => {
    const rows = snapshotsFor('360 ONE Focused Equity Fund')
    expect(rows).toHaveLength(4)
    expect(rows[0]).toEqual({
      date: '2025-01-20', source: 'mf', asset: '360 ONE Focused Equity Fund', valueINR: 50000,
    })
    expect(rows[0].investedINR).toBeUndefined()
  })
})

describe('SBI PSU Fund (SOLD, M/N)', () => {
  it('parses 4 snapshots, every one flagged sold: true', () => {
    const rows = snapshotsFor('SBI PSU Fund')
    expect(rows).toHaveLength(4)
    expect(rows.every((r) => r.sold === true)).toBe(true)
    expect(rows[3]).toEqual({
      date: '2025-03-15', source: 'mf', asset: 'SBI PSU Fund', valueINR: 24200, sold: true,
    })
  })
})

describe('Aditya Birla Sun Life Flexi Cap Fund (lump 100000, O/P)', () => {
  it('parses 2 snapshots, first is the lump investment', () => {
    const rows = snapshotsFor('Aditya Birla Sun Life Flexi Cap Fund')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({
      date: '2024-05-01', source: 'mf', asset: 'Aditya Birla Sun Life Flexi Cap Fund', valueINR: 100000,
    })
    expect(rows[1].valueINR).toBe(118500)
  })
})

describe('SBI PSU Fund - Series 2 (SOLD, Q/R)', () => {
  it('parses 3 snapshots, all flagged sold: true', () => {
    const rows = snapshotsFor('SBI PSU Fund - Series 2')
    expect(rows).toHaveLength(3)
    expect(rows.every((r) => r.sold === true)).toBe(true)
  })
})

describe('HDFC Small Cap Fund (S/T)', () => {
  it('parses 5 snapshots', () => {
    expect(snapshotsFor('HDFC Small Cap Fund')).toHaveLength(5)
  })
})

describe('Motilal Oswal Midcap Fund (U/V)', () => {
  it('parses 4 snapshots', () => {
    expect(snapshotsFor('Motilal Oswal Midcap Fund')).toHaveLength(4)
  })
})

describe('Invesco India Midcap Fund (lump 215000, W/X)', () => {
  it('parses 2 snapshots', () => {
    const rows = snapshotsFor('Invesco India Midcap Fund')
    expect(rows).toHaveLength(2)
    expect(rows[0].valueINR).toBe(215000)
    expect(rows[1].valueINR).toBe(248000)
  })
})

describe('scaffold rows (rows 11-38: column A running number only, no group data)', () => {
  it('produce zero snapshots and zero issues across the whole tail of the range', () => {
    const total = result.snapshots.length
    // 8 + 8 + 6 + 4 + 4 + 2 + 3 + 5 + 4 + 2 = 46
    expect(total).toBe(46)
  })
})

describe('summary (M39:N42)', () => {
  it('reads invested/current/pct from N39/N40/N41', () => {
    expect(result.summary).toEqual({ investedINR: 754000, currentINR: 708699, pctChange: -6.01 })
  })
})

describe('overall issue set', () => {
  it('contains exactly the 3 planted issue-worthy cells — no stray drops', () => {
    const kinds = result.issues.map((i) => `${i.kind}@${i.cell}`).sort()
    expect(kinds).toEqual(['bad-date@B6', 'bad-number@F5', 'ref-error@I5'])
  })
})
