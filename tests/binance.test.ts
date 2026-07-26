import { describe, it, expect } from 'vitest'
import { parseBinance } from '../src/parse/binance'
import fixture from './fixtures/BINANCE.json'
import type { SpecialGrids } from '../src/data/specialTabs'

const grids = fixture as SpecialGrids
const result = parseBinance(grids)

describe('BINANCE data rows (header row 2, data rows 3+ until 2-row blank streak)', () => {
  it('parses 14 real data rows as InvestmentSnapshot[] (rows 18-19 blank stop the scan)', () => {
    expect(result.snapshots).toHaveLength(14)
    expect(result.snapshots.every((s) => s.source === 'binance')).toBe(true)
  })

  it('first row: date, running total (investedEUR), spot (valueEUR)', () => {
    expect(result.snapshots[0]).toEqual({
      date: '2023-11-01', source: 'binance', asset: 'Binance', investedEUR: 100, valueEUR: 95,
    })
  })

  it('a single blank row (row 10) does NOT stop the scan -- streak needs 2 consecutive', () => {
    // 7 rows before the lone blank (3-9) + 7 rows after it (11-17) = 14 total,
    // so the row-10 gap cannot have truncated the scan.
    expect(result.snapshots.filter((s) => s.date !== null && s.date < '2023-12-01')).toHaveLength(6)
    expect(result.snapshots.some((s) => s.investedEUR === 1150)).toBe(true) // row 11, right after the gap
  })

  it('planted bad date at B13 -> bad-date issue, row kept with date: null, amounts intact (live-run correction #13: date moved from A to B)', () => {
    const row = result.snapshots.find((s) => s.investedEUR === 1350)
    expect(row).toEqual({
      date: null, source: 'binance', asset: 'Binance', investedEUR: 1350, valueEUR: 1200,
    })
    expect(result.issues).toContainEqual({
      sheet: 'BINANCE', cell: 'B13', kind: 'bad-date',
      detail: expect.stringContaining('32-13-2023'), raw: '32-13-2023',
    })
  })

  it('column A (running index) is never date-parsed — no issue for any A-column cell', () => {
    expect(result.issues.find((i) => i.cell?.startsWith('A'))).toBeUndefined()
  })

  it('last row (row 17) is the 14th snapshot', () => {
    expect(result.snapshots[13]).toEqual({
      date: '2024-01-15', source: 'binance', asset: 'Binance', investedEUR: 1462.76, valueEUR: 362,
    })
  })
})

describe('rows after the blank streak (20-30) are silently ignored', () => {
  it('leftover data at row 25 (D25=9999, F25=9999) produces no snapshot and no issue', () => {
    expect(result.snapshots.some((s) => s.investedEUR === 9999)).toBe(false)
    expect(result.issues.find((i) => i.cell?.startsWith('A25') || i.cell?.startsWith('D25'))).toBeUndefined()
  })
})

describe('net/current totals from the final data row', () => {
  it('netInEUR and currentEUR read from row 17 (D17/F17)', () => {
    expect(result.netInEUR).toBe(1462.76)
    expect(result.currentEUR).toBe(362)
  })
})

describe('overall issue set', () => {
  it('contains exactly the one planted bad-date — no stray drops', () => {
    const kinds = result.issues.map((i) => `${i.kind}@${i.cell}`).sort()
    expect(kinds).toEqual(['bad-date@B13'])
  })
})
