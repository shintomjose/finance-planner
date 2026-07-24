import { it, expect } from 'vitest'
import { parseMonth } from '../src/parse/month'
import JAN_22 from './fixtures/JAN_22.json'
import JUN_25 from './fixtures/JUN_25.json'

it('summary cells read per era', () => {
  const m = parseMonth('JAN_22', JAN_22 as any)
  expect(m.summary.totalIncome).not.toBeNull()
  expect(m.summary.household).toBe((JAN_22 as any).values[5][6]) // G6
})
it('v2025 household at G4', () => {
  const m = parseMonth('JUN_25', JUN_25 as any)
  expect(m.summary.household).toBe((JUN_25 as any).values[3][6]) // G4
})
it('household rows tagged from formula refs', () => {
  const m = parseMonth('JAN_22', JAN_22 as any) // formulas.G6 = "=D3+D5"
  const hh = m.expenses.filter(t => t.household).map(t => t.row).sort()
  expect(hh).toEqual([3, 5])
})
it('missing household formula → issue, no crash', () => {
  const noF = { ...(JAN_22 as any), formulas: {} }
  const m = parseMonth('JAN_22', noF)
  expect(m.issues.some(i => i.kind === 'missing-formula')).toBe(true)
})

// --- Finding 2: DEC_23-like case — blank G6 (household not tracked that ---
// month) must not produce bad-number/missing-formula noise. In-test mutation
// of JAN_22 (full era) stands in for DEC_23: values[5][6]=null (G6) + no
// household formula.

it('blank household cell (G6 null) + no formula → household null, NO bad-number, NO missing-formula', () => {
  const broken = JSON.parse(JSON.stringify(JAN_22)) as any
  broken.values[5][6] = null // G6
  delete broken.formulas.G6
  const m = parseMonth('JAN_22', broken)
  expect(m.summary.household).toBeNull()
  expect(m.issues.some(i => i.kind === 'bad-number' && i.cell === 'G6')).toBe(false)
  expect(m.issues.some(i => i.kind === 'missing-formula')).toBe(false)
})

it('household cell HAS a value but formula is missing → missing-formula STILL fires', () => {
  const broken = JSON.parse(JSON.stringify(JAN_22)) as any
  // values[5][6] (G6) already numeric in the fixture; just drop the formula
  delete broken.formulas.G6
  const m = parseMonth('JAN_22', broken)
  expect(m.summary.household).not.toBeNull()
  expect(m.issues.some(i => i.kind === 'missing-formula')).toBe(true)
})

it('blank G1 (totalIncome) → null, no bad-number issue', () => {
  const broken = JSON.parse(JSON.stringify(JAN_22)) as any
  broken.values[0][6] = null // G1
  const m = parseMonth('JAN_22', broken)
  expect(m.summary.totalIncome).toBeNull()
  expect(m.issues.some(i => i.kind === 'bad-number' && i.cell === 'G1')).toBe(false)
})

it('non-numeric non-blank summary cell (e.g. "abc") still records bad-number', () => {
  const broken = JSON.parse(JSON.stringify(JAN_22)) as any
  broken.values[0][6] = 'abc' // G1
  const m = parseMonth('JAN_22', broken)
  expect(m.summary.totalIncome).toBeNull()
  expect(m.issues.some(i => i.kind === 'bad-number' && i.cell === 'G1')).toBe(true)
})

it('#REF! summary cell: non-blank non-numeric keeps current behavior (bad-number), unaffected by blank-tolerance fix', () => {
  const broken = JSON.parse(JSON.stringify(JAN_22)) as any
  broken.values[0][6] = '#REF!' // G1
  const m = parseMonth('JAN_22', broken)
  expect(m.summary.totalIncome).toBeNull()
  expect(m.issues.some(i => i.kind === 'bad-number' && i.cell === 'G1')).toBe(true)
})
