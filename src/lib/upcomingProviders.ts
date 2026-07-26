import { normLabel } from './normalize'
import type { UpcomingItem } from '../types'

export interface ProviderGroup {
  name: string
  total: number
  items: { label: string; toPay: number | null }[]
}

export function groupUpcoming(bills: UpcomingItem[]): ProviderGroup[] {
  // Pattern matching table: [substring, display name]
  // Both 'advancia' and 'advanzia' map to 'Advanzia' (normLabel merges the typo)
  const patterns: [string, string][] = [
    ['advanzia', 'Advanzia'],
    ['advancia', 'Advanzia'],
    ['amex', 'Amex'],
    ['sparkasse', 'Sparkasse'],
    ['amazon', 'Amazon'],
    ['commerzbank', 'Commerzbank'],
  ]

  // Accumulate into groups
  const groups = new Map<string, ProviderGroup>()

  for (const bill of bills) {
    // Normalize the name
    const normalized = normLabel(bill.name)

    // Find first matching pattern (substring match)
    let groupName = 'Other'
    for (const [pattern, name] of patterns) {
      if (normalized.includes(pattern)) {
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
    group.items.push({ label: bill.name, toPay: bill.toPay })
    group.total += bill.toPay ?? 0
  }

  // Sort by total desc
  return Array.from(groups.values()).sort((a, b) => b.total - a.total)
}
