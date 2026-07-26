export type Era = '2019v1' | '2019v2' | 'full' | 'v2025'
export interface Period { year: number; month: number } // month 1–12
// Plan 1 kinds (all currently emitted): 'bad-number'..'fetch-failed'.
// 'cache-error' added in Plan 2 Task 1 (hygiene backlog). 'bad-date' |
// 'ambiguous-date' | 'sum-drift' pre-declared here for the Plan 2 special-tab
// parsers (Tasks 3–6) — not emitted yet, but reserved so those tasks don't
// need another union edit.
export type ParserIssueKind =
  | 'bad-number'
  | 'ref-error'
  | 'missing-formula'
  | 'marker-not-found'
  | 'dropped-row'
  | 'unknown-tab'
  | 'missing-current-month'
  | 'fetch-failed'
  | 'cache-error'
  | 'bad-date'
  | 'ambiguous-date'
  | 'sum-drift'
export interface ParserIssue { sheet: string; cell?: string; kind: ParserIssueKind; detail: string; raw?: unknown }
export interface Tx {
  tab: string; row: number; label: string; normLabel: string;
  amountEUR: number | null; kind: 'income' | 'expense';
  planned: boolean; household: boolean
}
export interface BankAccount { name: string; amountEUR: number }
export interface UpcomingItem { name: string; total: number | null; toPay: number | null }
export interface MonthSummaryCells { totalIncome: number | null; totalExpense: number | null; balance: number | null; household: number | null }
export interface MonthData {
  tab: string; period: Period; era: Era;
  income: Tx[]; expenses: Tx[]; carryover: number | null;
  summary: MonthSummaryCells; banks: BankAccount[]; bankTotal: number | null;
  expectedActual: number | null; balanceAfterFuture: number | null;
  upcoming: UpcomingItem[]; issues: ParserIssue[]
}

// Plan 2 domain types (Task 2 brief) — produced by the special-tab parsers
// (Tasks 3–6), not wired into any parser/UI yet.
// plannedMonthly is nullable: a labeled MONTHLY_PLAN budget row with a blank
// amount cell is planned-semantics (category exists, no figure entered yet;
// live-run correction #1, 2026-07-26) — not excluded, not zero.
export interface Budget { category: string; plannedMonthly: number | null }

export interface InvestmentSnapshot {
  date: string | null
  source: 'db' | 'mf' | 'binance' | 'upstocks' | 'bank'
  asset: string
  investedEUR?: number
  valueEUR?: number
  investedINR?: number
  valueINR?: number
  // Mutual-funds parser (Task 4): flags a fund that has been fully sold off.
  sold?: boolean
}

export interface PersonLedger {
  name: string
  entries: { date: string | null; label: string; amountEUR: number | null; row: number }[]
  repayments: { date: string | null; label: string; amountEUR: number | null; row: number }[]
  emis: { name: string; rows: { date: string | null; label: string; amountEUR: number | null; row: number }[] }[]
  totals: { given: number; repaid: number; remaining: number }
}

export interface Trip {
  name: string
  totalINR: number | null
  entriesINR: { date: string | null; label: string; amount: number | null; row: number }[]
  entriesEUR: { date: string | null; label: string; amount: number | null; row: number }[]
  iciciSplitINR: number | null
}

export interface LogEntry {
  log: 'petrol' | 'gym' | 'gear' | 'alcohol'
  date: string | null
  fields: Record<string, number | string | null>
}
