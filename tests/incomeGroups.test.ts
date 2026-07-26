import { describe, expect, it } from 'vitest'
import { groupIncome } from '../src/lib/incomeGroups'
import type { Tx } from '../src/types'

function inc(label: string, amountEUR: number | null): Tx {
  return { tab: 'T', row: 1, label, normLabel: label.toLowerCase().trim(), amountEUR, kind: 'income', planned: false, household: false }
}

describe('groupIncome', () => {
  it('buckets by pattern and sorts by total desc', () => {
    const groups = groupIncome([
      inc('Salary', 3000), inc('Kindergeld', 250),
      inc('Revolut Add', 400), inc('Revolut Add', 100),
      inc('Paypal', 60), inc('Aman', 20),
    ])
    expect(groups.map((g) => g.name)).toEqual(['Salary', 'Revolut transfers', 'Kindergeld', 'Paypal', 'Other'])
    expect(groups[1].total).toBe(500)
    expect(groups[1].items).toHaveLength(2)
  })
  it('omits empty groups, handles null amounts', () => {
    const groups = groupIncome([inc('Salary', null)])
    expect(groups).toHaveLength(1)
    expect(groups[0].total).toBe(0)
  })
})
