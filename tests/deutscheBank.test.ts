import { describe, it, expect } from 'vitest'
import { parseDeutscheBank } from '../src/parse/deutscheBank'
import fixture from './fixtures/DEUTSCHE_BANK.json'
import type { SpecialGrids } from '../src/data/specialTabs'

const grids = fixture as SpecialGrids
const result = parseDeutscheBank(grids)

// Live-run correction #11 (2026-07-26): product columns are discovered
// dynamically from the row-2 header, in column order G,H,J,K,L,M,N (I is
// hardcoded as the valuation column, correction #12, and never scanned). G's
// header is blank on the live sheet, so the discovered order here is
// H (fallback "Equities Invested"), J (fallback "Profit"),
// K (RiesterRente Shinto), L (RiesterRente Sandra), M (BasisRente),
// N (Badenia Bausparen) — 6 columns, perProduct arrays are index-aligned to
// this order.

describe('products (A2:C10)', () => {
  it('parses the 5 real product rows (A7:C10 blank -> skipped, no issue)', () => {
    expect(result.products).toEqual([
      { name: 'RiesterRente Shinto', monthlyEUR: 160.42 },
      { name: 'BasisRente', monthlyEUR: 27 },
      { name: 'RiesterRente Sandra', monthlyEUR: 10 },
      { name: 'Badenia Bausparen', monthlyEUR: 210 },
      { name: 'DWS Fonds', monthlyEUR: 199.97 },
    ])
  })
})

describe('dynamic product-column discovery (row 2 header, live-run correction #11)', () => {
  it('discovers 6 columns in order H,J,K,L,M,N — G (blank header) is excluded, I is hardcoded elsewhere', () => {
    expect(result.productSums.map((p) => p.name)).toEqual([
      'Equities Invested', 'Profit', 'RiesterRente Shinto', 'RiesterRente Sandra', 'BasisRente', 'Badenia Bausparen',
    ])
  })

  it('unmatched headers ("Equities Invested" at H, "Profit" at J) are parsed anyway, using the raw header text as the product name', () => {
    const byName = Object.fromEntries(result.productSums.map((p) => [p.name, p]))
    expect(byName['Equities Invested']).toEqual({ name: 'Equities Invested', sheetSum: null, computedSum: 0 })
    expect(byName['Profit']).toEqual({ name: 'Profit', sheetSum: null, computedSum: 0 })
  })

  it('the "Resiterrente" typo at L is tolerated -> still maps to canonical "RiesterRente Sandra"', () => {
    expect(result.productSums.some((p) => p.name === 'RiesterRente Sandra')).toBe(true)
  })
})

describe('payment matrix (E3:N90, row 2 is the header, row 91 is the totals footer)', () => {
  it('parses exactly 68 real payment rows (rows 71-90 are blank scaffold, skipped silently)', () => {
    expect(result.payments).toHaveLength(68)
  })

  it('first payment (n=1): date + 6-column perProduct, aligned to the discovered column order', () => {
    expect(result.payments[0]).toEqual({
      n: 1, date: '2020-07-01', perProduct: [null, null, 160.42, 10, 27, 210],
    })
  })

  it('last payment (n=68) is included — the scaffold cutoff is exactly after it', () => {
    expect(result.payments[67]).toEqual({
      n: 68, date: '2026-02-01', perProduct: [null, null, 160.42, 10, 27, 210],
    })
  })

  it('planted bad date at F32 (n=30) -> bad-date issue, row kept with date: null, amounts intact', () => {
    const row = result.payments.find((p) => p.n === 30)
    expect(row).toEqual({ n: 30, date: null, perProduct: [null, null, 160.42, 10, 27, 210] })
    expect(result.issues).toContainEqual({
      sheet: 'DEUTSCHE BANK', cell: 'F32', kind: 'bad-date',
      detail: expect.stringContaining('13-13-2025'), raw: '13-13-2025',
    })
  })

  it('planted #REF! at N47 (Badenia Bausparen, n=45) -> ref-error issue, row kept with that product null', () => {
    const row = result.payments.find((p) => p.n === 45)
    expect(row).toEqual({ n: 45, date: '2024-03-01', perProduct: [null, null, 160.42, 10, 27, null] })
    expect(result.issues).toContainEqual({
      sheet: 'DEUTSCHE BANK', cell: 'N47', kind: 'ref-error',
      detail: expect.stringContaining('#REF!'), raw: '#REF!',
    })
  })

  it('scaffold rows beyond #68 produce no payment entries and no issues', () => {
    expect(result.payments.some((p) => p.n !== null && p.n > 68)).toBe(false)
  })

  it('valuation-only row (row 81: F+I populated, E and all product cols blank) is NOT a payment', () => {
    expect(result.payments).toHaveLength(68)
    expect(result.payments.some((p) => p.n === null)).toBe(false)
  })

  it('row 62 (n=60): #REF! at F62 is both a payment date AND a valuation date -> exactly one ref-error issue', () => {
    const row = result.payments.find((p) => p.n === 60)
    expect(row).toEqual({ n: 60, date: null, perProduct: [null, null, 160.42, 10, 27, 210] })
    expect(result.issues.filter((i) => i.cell === 'F62')).toEqual([
      { sheet: 'DEUTSCHE BANK', cell: 'F62', kind: 'ref-error', detail: expect.stringContaining('#REF!'), raw: '#REF!' },
    ])
  })
})

describe('grand total (G91)', () => {
  it('reads the grand total cell directly', () => {
    expect(result.grandTotalEUR).toBe(41102.52)
  })
})

describe('valuations (sporadic col I, source db — unchanged design, live-run correction #12)', () => {
  it('collects all 7 sporadic snapshots in row order', () => {
    expect(result.valuations).toEqual([
      { date: '2021-04-01', source: 'db', asset: 'DEUTSCHE BANK', valueEUR: 9000 },
      { date: '2022-07-01', source: 'db', asset: 'DEUTSCHE BANK', valueEUR: 10500 },
      { date: '2023-10-01', source: 'db', asset: 'DEUTSCHE BANK', valueEUR: 12200 },
      { date: '2025-01-01', source: 'db', asset: 'DEUTSCHE BANK', valueEUR: 13800 },
      // row 62: F62 is '#REF!' (shared with the payment above) -> date null, value kept
      { date: null, source: 'db', asset: 'DEUTSCHE BANK', valueEUR: 12500 },
      { date: '2026-02-01', source: 'db', asset: 'DEUTSCHE BANK', valueEUR: 15143.17 },
      // row 81: valuation-only row, no payment counterpart
      { date: '2021-09-15', source: 'db', asset: 'DEUTSCHE BANK', valueEUR: 11200 },
    ])
  })

  it('row 81 valuation-only snapshot does not require a matching payment row', () => {
    expect(result.valuations.some((v) => v.valueEUR === 11200)).toBe(true)
    expect(result.payments.some((p) => p.date === '2021-09-15')).toBe(false)
  })
})

describe('per-product sums (row 91) vs recompute, per MAPPED column (live-run correction #11)', () => {
  it('the 4 known products match sheet vs recomputed sum within tolerance', () => {
    const byName = Object.fromEntries(result.productSums.map((p) => [p.name, p]))
    expect(byName['RiesterRente Shinto'].sheetSum).toBe(10908.56)
    expect(byName['RiesterRente Shinto'].computedSum).toBeCloseTo(10908.56, 2)
    expect(byName['BasisRente']).toEqual({ name: 'BasisRente', sheetSum: 1836, computedSum: 1836 })
    expect(byName['Badenia Bausparen'].sheetSum).toBe(14070)
    expect(byName['Badenia Bausparen'].computedSum).toBeCloseTo(14070, 2)
  })

  it('planted drift on RiesterRente Sandra: sheet says 690, recompute says 680 -> sum-drift issue at L91 (remapped column)', () => {
    const sandra = result.productSums.find((p) => p.name === 'RiesterRente Sandra')
    expect(sandra?.sheetSum).toBe(690)
    expect(sandra?.computedSum).toBeCloseTo(680, 2)
    expect(result.issues).toContainEqual({
      sheet: 'DEUTSCHE BANK', cell: 'L91', kind: 'sum-drift',
      detail: expect.stringContaining('RiesterRente Sandra'),
    })
  })

  it('only one sum-drift issue is emitted — after the remap, no other product drifts (the 4 old-code drifts were column misassignment)', () => {
    expect(result.issues.filter((i) => i.kind === 'sum-drift')).toHaveLength(1)
  })
})

describe('overall issue set', () => {
  it('contains exactly the 4 planted issue-worthy cells — no stray drops, no duplicates', () => {
    const kinds = result.issues.map((i) => `${i.kind}@${i.cell}`).sort()
    expect(kinds).toEqual(['bad-date@F32', 'ref-error@F62', 'ref-error@N47', 'sum-drift@L91'])
  })
})
