// Trends screen pure logic (Plan 2 Task 10): monthly income/expense/net
// series, per-category monthly series (top N + "other" rollup), year-over-
// year same-month expense deltas, top movers (latest month vs trailing
// average), and household vs. rest split. Reuses categorize()/normLabel()
// (normalize.ts) for bucketing and the same defensive re-sort-by-period
// pattern as carryover.ts's computeChain — callers pass MonthData[] already
// sorted, but nothing here assumes it.
import { round2, sortByPeriod, sumAmounts } from './mathUtils'
import { categorize } from './normalize'
import type { MonthData } from '../types'

export interface MonthlyPoint { tab: string; year: number; month: number; income: number; expense: number; net: number }
export interface CategorySeries { category: string; points: { tab: string; value: number }[] }
export interface YoYDelta { month: number; monthName: string; current: number | null; previous: number | null; deltaPct: number | null }
export interface TopMover { category: string; current: number; trailingAvg: number; deltaEUR: number; deltaPct: number | null }
export interface HouseholdSplitPoint { tab: string; household: number; other: number }

const OTHER_CATEGORY = 'other'
// Exported so the screen can echo the same number in copy ("moved by more
// than €20...") instead of hand-syncing a second literal (reviewer minor).
export const MIN_MOVER_DELTA_EUR = 20
const MAX_MOVERS = 8
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function monthlyTotals(months: MonthData[]): MonthlyPoint[] {
  return sortByPeriod(months).map((m) => {
    const income = round2(sumAmounts(m.income))
    const expense = round2(sumAmounts(m.expenses))
    return { tab: m.tab, year: m.period.year, month: m.period.month, income, expense, net: round2(income - expense) }
  })
}

export function categorySeries(months: MonthData[], overrides: Record<string, string>, topN = 6): CategorySeries[] {
  const sorted = sortByPeriod(months)
  if (sorted.length === 0) return []

  const totals = new Map<string, number>()
  for (const m of sorted) {
    for (const tx of m.expenses) {
      const cat = categorize(tx.normLabel, overrides)
      totals.set(cat, round2((totals.get(cat) ?? 0) + (tx.amountEUR ?? 0)))
    }
  }

  const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  const head = ranked.slice(0, topN).map(([cat]) => cat)
  const headSet = new Set(head)
  const categories = ranked.length > topN ? [...head, OTHER_CATEGORY] : head

  return categories.map((category) => ({
    category,
    points: sorted.map((m) => {
      let value = 0
      for (const tx of m.expenses) {
        const cat = categorize(tx.normLabel, overrides)
        const belongs = category === OTHER_CATEGORY ? !headSet.has(cat) : cat === category
        if (belongs) value += tx.amountEUR ?? 0
      }
      return { tab: m.tab, value: round2(value) }
    }),
  }))
}

export function yoySameMonth(months: MonthData[], now: Date): YoYDelta[] {
  const year = now.getFullYear()
  const byPeriod = new Map<string, MonthData>()
  for (const m of months) byPeriod.set(`${m.period.year}-${m.period.month}`, m)

  const expenseTotal = (m: MonthData | undefined): number | null => (m ? round2(sumAmounts(m.expenses)) : null)

  const result: YoYDelta[] = []
  for (let month = 1; month <= 12; month++) {
    const current = expenseTotal(byPeriod.get(`${year}-${month}`))
    const previous = expenseTotal(byPeriod.get(`${year - 1}-${month}`))
    const deltaPct =
      current == null || previous == null || previous === 0 ? null : round2(((current - previous) / previous) * 100)
    result.push({ month, monthName: MONTH_NAMES[month - 1], current, previous, deltaPct })
  }
  return result
}

function categoryTotal(month: MonthData, category: string, overrides: Record<string, string>): number {
  return round2(sumAmounts(month.expenses.filter((tx) => categorize(tx.normLabel, overrides) === category)))
}

export function topMovers(months: MonthData[], overrides: Record<string, string>, trailing = 3): TopMover[] {
  const sorted = sortByPeriod(months)
  if (sorted.length === 0) return []

  const latest = sorted[sorted.length - 1]
  const priorMonths = sorted.slice(0, -1)
  const window = priorMonths.slice(Math.max(0, priorMonths.length - trailing))

  const categories = new Set<string>()
  for (const tx of latest.expenses) categories.add(categorize(tx.normLabel, overrides))
  for (const m of window) for (const tx of m.expenses) categories.add(categorize(tx.normLabel, overrides))

  const movers: TopMover[] = []
  for (const category of categories) {
    const current = categoryTotal(latest, category, overrides)
    const trailingAvg =
      window.length > 0 ? round2(window.reduce((sum, m) => sum + categoryTotal(m, category, overrides), 0) / window.length) : 0
    const deltaEUR = round2(current - trailingAvg)
    if (Math.abs(deltaEUR) < MIN_MOVER_DELTA_EUR) continue
    const deltaPct = trailingAvg === 0 ? null : round2((deltaEUR / trailingAvg) * 100)
    movers.push({ category, current, trailingAvg, deltaEUR, deltaPct })
  }

  movers.sort((a, b) => Math.abs(b.deltaEUR) - Math.abs(a.deltaEUR) || a.category.localeCompare(b.category))
  return movers.slice(0, MAX_MOVERS)
}

export function householdSplit(months: MonthData[]): HouseholdSplitPoint[] {
  return sortByPeriod(months).map((m) => {
    let household = 0
    let other = 0
    for (const tx of m.expenses) {
      if (tx.household) household += tx.amountEUR ?? 0
      else other += tx.amountEUR ?? 0
    }
    return { tab: m.tab, household: round2(household), other: round2(other) }
  })
}
