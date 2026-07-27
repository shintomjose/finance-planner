import { it, expect } from 'vitest'
import { parseMonth } from '../src/parse/month'
import JAN from './fixtures/JAN.json'
import AUG from './fixtures/AUG.json'
import JAN_22 from './fixtures/JAN_22.json'
import JUN_25 from './fixtures/JUN_25.json'

it('2019v1 has no bank/upcoming blocks and no issues about them', () => {
  const m = parseMonth('JAN', JAN as any)
  expect(m.banks).toEqual([]); expect(m.upcoming).toEqual([])
})
it('banks until Total label; rows below Total captured', () => {
  const m = parseMonth('AUG', AUG as any)
  expect(m.banks.length).toBe(3)          // fixture I2:I4 accounts
  expect(m.bankTotal).toBe(1234.5)        // J at I='Total'
  expect(m.expectedActual).not.toBeNull()
})
it('upcoming located by Total label at varying row', () => {
  // AUG fixture M2:M5 = Car Service, Gym, Amazon CC, Sachin (4 names), Total
  // at M6 — see tests/fixtures/AUG.json. (Brief listed 3; verified against
  // the actual fixture contents, which carry 4 named rows before Total.)
  expect(parseMonth('AUG', AUG as any).upcoming.length).toBe(4)
  expect(parseMonth('JUN_25', JUN_25 as any).upcoming.length).toBeGreaterThan(0)
})
it('missing Total marker → issue', () => {
  const broken = JSON.parse(JSON.stringify(AUG)) as any
  broken.values[4][8] = 'Totall' // corrupt the marker
  expect(parseMonth('AUG', broken).issues.some(i => i.kind === 'marker-not-found')).toBe(true)
})

// --- Additional coverage (self-review: era gates, label-scan, #REF! rows) ---

it('full era: banks and upcoming both populated', () => {
  const m = parseMonth('JAN_22', JAN_22 as any)
  expect(m.banks.length).toBe(3)
  expect(m.bankTotal).toBe(1240)
  expect(m.expectedActual).toBe(1180)
  expect(m.balanceAfterFuture).toBe(1050)
  expect(m.upcoming.length).toBe(6) // M2:M7, Total at M8
})

it('v2025 era: banks and upcoming both populated', () => {
  const m = parseMonth('JUN_25', JUN_25 as any)
  expect(m.banks.length).toBe(3)
  expect(m.bankTotal).toBe(1650)
  expect(m.expectedActual).toBe(1600)
  expect(m.balanceAfterFuture).toBe(1400)
  expect(m.upcoming.length).toBeGreaterThan(0)
})

it('JAN_22 #REF! at J9 sits below the read rows (Old Federal Bank Debt, ' +
   'past Balance After future Expense) — no crash, no issue for it', () => {
  const m = parseMonth('JAN_22', JAN_22 as any)
  expect((JAN_22 as any).values[8][9]).toBe('#REF!') // sanity: I9/J9 fixture fact
  expect(m.issues.some(i => i.cell === 'J9')).toBe(false)
  // expectedActual/balanceAfterFuture found correctly despite the stray row
  expect(m.expectedActual).toBe(1180)
  expect(m.balanceAfterFuture).toBe(1050)
})

it('a #REF! bank-account amount (within read rows) produces a ref-error issue, no crash', () => {
  const broken = JSON.parse(JSON.stringify(AUG)) as any
  broken.values[1][9] = '#REF!' // J2, Sparkasse's amount — inside the read range
  const m = parseMonth('AUG', broken)
  expect(m.issues.some(i => i.kind === 'ref-error' && i.cell === 'J2')).toBe(true)
  expect(m.banks.find(b => b.name === 'Sparkasse')).toBeUndefined()
})

it('a blank bank-account amount is dropped from banks[] but surfaced as a dropped-row issue', () => {
  const broken = JSON.parse(JSON.stringify(AUG)) as any
  broken.values[3][9] = null // J4, N26's amount — blank, inside the read range
  const m = parseMonth('AUG', broken)
  expect(m.banks.find(b => b.name === 'N26')).toBeUndefined()
  expect(m.issues.some(i => i.kind === 'dropped-row' && i.cell === 'J4')).toBe(true)
})

// --- Finding 1: 2019v2 upcoming block is OPTIONAL (real sheet: JUL/AUG 2019 ---
// have no upcoming "Total" in column M — it only appears from later 2019v2
// months). JUN stays banks-only (unaffected — upcomingExpectedFor already
// excludes it). JUL/AUG must not report marker-not-found for upcoming.

it('2019v2 JUL-like tab with no upcoming block at all → upcoming [], no marker-not-found issue', () => {
  // Clone AUG (2019v2 shape) but strip the upcoming block (M2:O6) and rename
  // to JUL — bare 'JUL' resolves to year 2019, month 7, era 2019v2 (period.ts).
  const noUpcoming = JSON.parse(JSON.stringify(AUG)) as any
  for (let row = 1; row <= 5; row++) { // rows 2..6 (0-indexed 1..5), cols M(12)-O(14)
    noUpcoming.values[row][12] = null
    noUpcoming.values[row][13] = null
    noUpcoming.values[row][14] = null
  }
  const m = parseMonth('JUL', noUpcoming)
  expect(m.era).toBe('2019v2')
  expect(m.upcoming).toEqual([])
  expect(m.issues.some(i => i.kind === 'marker-not-found' && i.detail.includes('upcoming'))).toBe(false)
})

it('2019v2 AUG (upcoming block present) still parses upcoming normally — with-block path unaffected', () => {
  const m = parseMonth('AUG', AUG as any)
  expect(m.upcoming.length).toBe(4)
  expect(m.issues.some(i => i.kind === 'marker-not-found' && i.detail.includes('upcoming'))).toBe(false)
})

// --- Scratch capture (spec 2026-07-27 §1) -------------------------------

it('v2025 scratch: IJ label+number pairs below bank Total captured; non-numeric skipped silently', () => {
  const m = parseMonth('JUN_25', JUN_25 as any)
  const ij = (m.scratch ?? []).filter((s) => s.block === 'IJ')
  expect(ij.map((s) => [s.normLabel, s.amountEUR])).toEqual([
    ['current amazon', 320.5],
    ['current advancia', 1500.75],
    ['amex', 210.4],
    ['sachin', 80.25],
  ])
  // "Scratch note"/"see notes" (I8/J8) is non-numeric → not captured, and no
  // issue either (deliberate spec exception for the free-form scratch areas).
  expect(ij.some((s) => s.normLabel === 'scratch note')).toBe(false)
  expect(m.issues.some((i) => i.cell === 'J8')).toBe(false)
})

it('v2025 scratch: KL pairs captured; #REF! value skipped with no issue', () => {
  const m = parseMonth('JUN_25', JUN_25 as any)
  const kl = (m.scratch ?? []).filter((s) => s.block === 'KL')
  expect(kl.map((s) => [s.normLabel, s.amountEUR])).toEqual([
    ['balance', 1650],
    ['sachin', 900.6],
  ])
  expect(kl.some((s) => s.normLabel === 'broken')).toBe(false)
  expect(m.issues.some((i) => i.kind === 'ref-error' && i.cell?.startsWith('L'))).toBe(false)
})

it('scratch excludes the Expected-Actual / Balance-after rows (dedicated fields already)', () => {
  const m = parseMonth('JUN_25', JUN_25 as any)
  const norms = (m.scratch ?? []).map((s) => s.normLabel)
  expect(norms.some((n) => n.startsWith('expected-actual'))).toBe(false)
  expect(norms.some((n) => n.startsWith('balance after future expense'))).toBe(false)
})

it('2019v1 (no bank block): scratch is empty, not undefined', () => {
  const m = parseMonth('JAN', JAN as any)
  expect(m.scratch).toEqual([])
})

it('full era (JAN_22): missing upcoming Total marker STILL issues — upcoming stays required', () => {
  const broken = JSON.parse(JSON.stringify(JAN_22)) as any
  broken.values[7][12] = 'Totall' // M8, the upcoming Total marker for JAN_22 (see month-summary/banks-upcoming fixtures)
  const m = parseMonth('JAN_22', broken)
  expect(m.era).toBe('full')
  expect(m.upcoming).toEqual([])
  expect(m.issues.some(i => i.kind === 'marker-not-found' && i.detail.includes('upcoming'))).toBe(true)
})
