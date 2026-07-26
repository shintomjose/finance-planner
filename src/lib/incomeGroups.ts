import type { Tx } from '../types'

export interface IncomeGroup {
  name: string
  total: number
  items: { label: string; amountEUR: number | null; planned: boolean }[]
}

export function groupIncome(income: Tx[]): IncomeGroup[] {
  // Pattern matching table: [RegExp, display name]
  const patterns: [RegExp, string][] = [
    [/salary|gehalt/i, 'Salary'],
    [/kindergeld/i, 'Kindergeld'],
    [/revolut/i, 'Revolut transfers'],
    [/paypal/i, 'Paypal'],
  ]

  // Accumulate into groups
  const groups = new Map<string, IncomeGroup>()

  for (const tx of income) {
    // Find first matching pattern
    let groupName = 'Other'
    for (const [pattern, name] of patterns) {
      if (pattern.test(tx.normLabel)) {
        groupName = name
        break
      }
    }

    // Initialize group if needed
    if (!groups.has(groupName)) {
      groups.set(groupName, { name: groupName, total: 0, items: [] })
    }

    // Add to group
    const group = groups.get(groupName)!
    group.items.push({ label: tx.label, amountEUR: tx.amountEUR, planned: tx.planned })
    group.total += tx.amountEUR ?? 0
  }

  // Sort by total desc and filter out empty groups
  return Array.from(groups.values())
    .filter((g) => g.items.length > 0)
    .sort((a, b) => b.total - a.total)
}
