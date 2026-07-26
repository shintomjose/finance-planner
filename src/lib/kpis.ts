// KPI assembly lib (Plan: template redesign, Task 4). Assembles the seven
// overview headline cards from per-month figures. Domain rule (repo golden
// rule, see overviewFigures.ts): "Last Month Balance" is carryover, not
// income — the income KPI is overviewFigures(m).incomeOwn, which always
// excludes carryover, regardless of which source backs the sheet's own
// Total Income cell.
import type { MonthData } from '../types'
import { overviewFigures } from './overviewFigures'
import { partitionUpcoming } from './foodHome'
import { round2, sortByPeriod } from './mathUtils'

export type KpiId = 'income' | 'expenses' | 'saved' | 'cash' | 'savings' | 'upcoming' | 'networth'

export interface KpiCard {
  id: KpiId
  label: string
  value: number | null // null → render '—'
  delta: number | null // vs previous month, same metric; null when no prev
  goodUp: boolean // is a positive delta good (colors delta text)
  series: (number | null)[] // ≤12 trailing values ending at selected month; null preserves a gap (e.g. no bank data that month), not coerced to 0
  note: string
}

export interface KpiOptions {
  target?: number | null
  investedEUR?: number | null
}

export interface MetricParts {
  income: number
  expenses: number
  saved: number
  cash: number | null
  savings: number | null
  upcoming: number
  expenseCount: number
  carryover: number
  billCount: number
  savingsNames: string[]
  bankCount: number
}

/** Per-month figure assembly shared by `buildKpis` (this file) and the
 * Trends screen rebuild (Task 9) — both need the same income/expenses/cash/
 * savings/upcoming figures for a single month, so this is exported rather
 * than kept as buildKpis' private helper (was `metricsOf`, pre-Task 9). */
export function monthMetrics(m: MonthData): MetricParts {
  const f = overviewFigures(m)
  const { bills } = partitionUpcoming(m.upcoming)
  const upcoming = round2(bills.reduce((s, b) => s + (b.toPay ?? 0), 0))
  const savAccounts = m.banks.filter((b) => /sav/i.test(b.name))
  const savings = savAccounts.length ? round2(savAccounts.reduce((s, b) => s + b.amountEUR, 0)) : null
  const cash = m.bankTotal ?? (m.banks.length ? round2(m.banks.reduce((s, b) => s + b.amountEUR, 0)) : null)
  return {
    income: f.incomeOwn,
    expenses: f.expense,
    saved: round2(f.incomeOwn - f.expense),
    cash,
    savings,
    upcoming,
    expenseCount: m.expenses.length,
    carryover: f.carryover,
    billCount: bills.length,
    savingsNames: savAccounts.map((b) => b.name),
    bankCount: m.banks.length,
  }
}

// de-DE (not en-US) so a KPI note's inline figure (e.g. "€1.000,00 invested")
// matches Money's own locale (shared.tsx's `eurFmt` is also
// `Intl.NumberFormat('de-DE', …)`) — a note quoting the same number in a
// different thousands/decimal convention than the card's own value right
// above it read as a bug (final-review finding). The negative form needs no
// special-casing: de-DE's own '-' sign here matches the same ASCII hyphen
// Money's `eurFmt.format()` already produces for a negative amount, so
// reusing this one formatter keeps both surfaces byte-identical.
const deNumFmt = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtNum = (n: number): string => deNumFmt.format(n)

function deltaFor(cur: number | null, prev: number | null): number | null {
  if (cur == null || prev == null) return null
  return round2(cur - prev)
}

interface MetricSpec {
  id: KpiId
  label: string
  goodUp: boolean
  value: (p: MetricParts, opts: KpiOptions) => number | null
  note: (p: MetricParts, opts: KpiOptions) => string
}

const METRICS: MetricSpec[] = [
  {
    id: 'income',
    label: 'Income',
    goodUp: true,
    value: (p) => p.income,
    note: (p) => (p.carryover !== 0 ? `carryover €${fmtNum(p.carryover)} excluded` : 'no carryover this month'),
  },
  {
    id: 'expenses',
    label: 'Expenses',
    goodUp: false,
    value: (p) => p.expenses,
    note: (p) => `across ${p.expenseCount} line items`,
  },
  {
    id: 'saved',
    label: 'Saved',
    goodUp: true,
    value: (p) => p.saved,
    note: (p, opts) => {
      if (opts.target != null) {
        return p.saved >= opts.target ? 'target met' : `€${fmtNum(opts.target - p.saved)} below target`
      }
      return 'income − expenses'
    },
  },
  {
    id: 'cash',
    label: 'Cash',
    goodUp: true,
    value: (p) => p.cash,
    note: (p) => `across ${p.bankCount} accounts`,
  },
  {
    id: 'savings',
    label: 'Savings',
    goodUp: true,
    value: (p) => p.savings,
    note: (p) => (p.savingsNames.length ? p.savingsNames.join(', ') : 'no savings account'),
  },
  {
    id: 'upcoming',
    label: 'Upcoming Bills',
    goodUp: false,
    value: (p) => p.upcoming,
    note: (p) => `${p.billCount} bills`,
  },
  {
    id: 'networth',
    label: 'Net Worth',
    goodUp: true,
    value: (p, opts) => (p.cash == null ? null : round2(p.cash + (p.savings ?? 0) + (opts.investedEUR ?? 0) - p.upcoming)),
    note: (_p, opts) => (opts.investedEUR != null ? `incl. €${fmtNum(opts.investedEUR)} invested` : 'excl. investments'),
  },
]

export function buildKpis(months: MonthData[], selectedTab: string, opts: KpiOptions = {}): KpiCard[] {
  const sorted = sortByPeriod(months)
  if (sorted.length === 0) return []
  const idx = sorted.findIndex((m) => m.tab === selectedTab)
  const end = idx >= 0 ? idx : sorted.length - 1
  const window = sorted.slice(Math.max(0, end - 11), end + 1)
  const parts = window.map(monthMetrics)
  const cur = parts[parts.length - 1]
  const prev = parts.length > 1 ? parts[parts.length - 2] : null

  return METRICS.map((spec) => {
    const curVal = spec.value(cur, opts)
    const prevVal = prev ? spec.value(prev, opts) : null
    return {
      id: spec.id,
      label: spec.label,
      value: curVal,
      delta: deltaFor(curVal, prevVal),
      goodUp: spec.goodUp,
      series: parts.map((p) => spec.value(p, opts)),
      note: spec.note(cur, opts),
    }
  })
}
