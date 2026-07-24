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
