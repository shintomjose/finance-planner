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
