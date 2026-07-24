export type Era = '2019v1' | '2019v2' | 'full' | 'v2025'
export interface Period { year: number; month: number } // month 1–12
export interface ParserIssue { sheet: string; cell?: string; kind: string; detail: string; raw?: unknown }
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
