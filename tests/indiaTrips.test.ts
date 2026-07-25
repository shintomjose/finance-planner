import { describe, it, expect } from 'vitest'
import { parseIndiaTrips } from '../src/parse/indiaTrips'
import fixture from './fixtures/INDIA_2023.json'
import type { SpecialGrids } from '../src/data/specialTabs'

const grids = fixture as SpecialGrids
const result = parseIndiaTrips(grids)
const { trips, issues } = result

describe('trip headers located by whole-grid text scan (never fixed rows)', () => {
  it('finds exactly 2 trips, at rows B5 and E60 -- neither matches the workbook-map fixture-reference rows', () => {
    expect(trips).toHaveLength(2)
    expect(trips.map((t) => t.name)).toEqual(['India Trip Dec 2023', '2024 India Trip'])
  })
})

describe('false-positive guard: an ordinary ledger line inside trip A that looks like a header', () => {
  // Planted at I9/J9/K9 (unused columns, but a row INSIDE trip A's own 7-11
  // ledger range): 'Flight 2023' / 'Total' / 5000 -- reviewer-demonstrated
  // false positive under the old bare-year `20\d\d` pattern with no
  // claimed-range guard (would fabricate a phantom 3rd trip named
  // "Flight 2023"). Neither condition should trip it now: the tightened
  // header pattern rejects "Flight 2023" outright (no "trip" keyword, no
  // month-name+year), and even a header-shaped string in the same spot
  // would be blocked by trip A's block already claiming rows 7-11.
  it('does not fabricate a phantom 3rd trip', () => {
    expect(trips).toHaveLength(2)
    expect(trips.some((t) => t.name === 'Flight 2023')).toBe(false)
  })

  it('trip A ledger boundary is intact -- the planted cells sit in unused columns, never read', () => {
    const trip = trips[0]
    expect(trip.entriesINR).toHaveLength(5)
    const sum = trip.entriesINR.reduce((s, e) => s + (e.amount ?? 0), 0)
    expect(sum).toBe(45000)
    expect(trip.entriesEUR).toHaveLength(3)
  })
})

describe('Trip A (India Trip Dec 2023, header B5, no ICICI split)', () => {
  const trip = trips[0]

  it('totalINR reads the header-adjacent sheet total', () => {
    expect(trip.totalINR).toBe(45000)
  })

  it('iciciSplitINR is null (this trip has no split column value)', () => {
    expect(trip.iciciSplitINR).toBeNull()
  })

  it('recomputed INR ledger sum matches the sheet total exactly -> no sum-drift issue', () => {
    expect(trip.entriesINR).toHaveLength(5)
    const sum = trip.entriesINR.reduce((s, e) => s + (e.amount ?? 0), 0)
    expect(sum).toBe(45000)
    expect(issues.some((i) => i.detail.includes('India Trip Dec 2023'))).toBe(false)
  })

  it('first INR entry', () => {
    expect(trip.entriesINR[0]).toEqual({ date: '2023-12-01', label: 'Flight India', amount: 20000, row: 7 })
  })

  it('EUR pre-travel ledger: 3 entries', () => {
    expect(trip.entriesEUR).toHaveLength(3)
    expect(trip.entriesEUR[0]).toEqual({ date: '2023-11-01', label: 'Visa Fee', amount: 80, row: 7 })
  })
})

describe('Trip B (2024 India Trip, header E60, has ICICI split)', () => {
  const trip = trips[1]

  it('totalINR and iciciSplitINR read from the header row', () => {
    expect(trip.totalINR).toBe(32000)
    expect(trip.iciciSplitINR).toBe(15000)
  })

  it('planted #REF! in the INR ledger (row 64) -> ref-error issue, entry kept with amount: null', () => {
    const row = trip.entriesINR.find((e) => e.row === 64)
    expect(row).toEqual({ date: '2024-07-10', label: 'Local Travel', amount: null, row: 64 })
    expect(issues).toContainEqual({
      sheet: 'INDIA_2023', cell: 'G64', kind: 'ref-error',
      detail: expect.stringContaining('#REF!'), raw: '#REF!',
    })
  })

  it('planted tiny sum-drift: recomputed 32000.02 vs sheet total 32000', () => {
    const sum = trip.entriesINR.reduce((s, e) => s + (e.amount ?? 0), 0)
    expect(sum).toBeCloseTo(32000.02, 2)
    expect(issues).toContainEqual({
      sheet: 'INDIA_2023', cell: 'G60', kind: 'sum-drift',
      detail: expect.stringContaining('2024 India Trip'),
    })
  })

  it('EUR pre-travel ledger: 3 entries', () => {
    expect(trip.entriesEUR).toHaveLength(3)
  })
})

describe('overall issue set', () => {
  it('contains exactly the 2 planted issue-worthy cells — no stray drops', () => {
    const kinds = issues.map((i) => `${i.kind}@${i.cell}`).sort()
    expect(kinds).toEqual(['ref-error@G64', 'sum-drift@G60'])
  })
})
