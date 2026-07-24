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
