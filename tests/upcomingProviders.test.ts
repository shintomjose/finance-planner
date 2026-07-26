import { describe, expect, it } from 'vitest'
import { groupUpcoming } from '../src/lib/upcomingProviders'

describe('groupUpcoming', () => {
  it('groups bills by provider substring with alias normalization', () => {
    const groups = groupUpcoming([
      { name: 'Advancia CC', total: 900, toPay: 900 },     // typo variant → Advanzia
      { name: 'Advanzia interest', total: 40, toPay: 40 },
      { name: 'Amex statement', total: 500, toPay: 500 },
      { name: 'Mystery bill', total: 10, toPay: 10 },
    ])
    expect(groups.map((g) => g.name)).toEqual(['Advanzia', 'Amex', 'Other'])
    expect(groups[0].total).toBe(940)
  })
  it('null toPay counts as 0 but the row stays listed', () => {
    const groups = groupUpcoming([{ name: 'Amex thing', total: 50, toPay: null }])
    expect(groups[0].total).toBe(0)
    expect(groups[0].items).toHaveLength(1)
  })
})
