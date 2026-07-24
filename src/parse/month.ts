// Month-ledger tab parser (workbook-map.md §1). Fills period/era resolution,
// income[], expenses[], carryover, and issues[] only (Task 5 scope). Other
// MonthData fields (summary, banks, upcoming, expectedActual,
// balanceAfterFuture) are left as empty/null placeholders for Tasks 6–7,
// which should add their own private `parseXBlock` functions alongside
// `parseIncomeBlock`/`parseExpenseBlock` below and wire them into
// `parseMonth`.
import { tabToPeriod, eraOf } from '../lib/period'
import { normLabel } from '../lib/normalize'
import type { MonthData, Tx, ParserIssue, Period } from '../types'

export interface MonthGrids {
  values: (string | number | null)[][]
  formulas: Record<string, string>
}

const INCOME_LAST_ROW = 40
const EXPENSE_LAST_ROW = 80
const CARRYOVER_LABEL = 'last month balance'

/** A1 column letters ('A', 'B', ..., 'Z', 'AA', ...) → 0-based index. */
function colToIndex(col: string): number {
  let idx = 0
  for (let i = 0; i < col.length; i++) idx = idx * 26 + (col.charCodeAt(i) - 64)
  return idx - 1
}

/** A1-notation cell ref (e.g. 'D19') → 0-based { row, col } grid indices. */
function parseA1(ref: string): { row: number; col: number } {
  const m = /^([A-Z]+)(\d+)$/.exec(ref)
  if (!m) return { row: -1, col: -1 }
  return { row: Number(m[2]) - 1, col: colToIndex(m[1]) }
}

/** Reads a single cell by A1 ref from the values grid; missing/OOB → null. */
function cell(values: (string | number | null)[][], ref: string): string | number | null {
  const { row, col } = parseA1(ref)
  if (row < 0 || col < 0) return null
  const line = values[row]
  if (!line) return null
  const v = line[col]
  return v === undefined ? null : v
}

const isBlank = (v: string | number | null): boolean => v === null || v === ''

/** Sheets error strings all start with '#' (#REF!, #N/A, #DIV/0!, ...). */
const isErrorString = (v: unknown): v is string => typeof v === 'string' && v.startsWith('#')

interface AmountResult { amountEUR: number | null; planned: boolean }

/**
 * Resolves a raw cell value into a Tx-ready amount, recording a ParserIssue
 * for error strings (kind 'ref-error') or other unparseable strings (kind
 * 'bad-number'). Blank cells are not an error — they mean planned/unpaid.
 */
function readAmount(raw: string | number | null, tab: string, ref: string, issues: ParserIssue[]): AmountResult {
  if (isBlank(raw)) return { amountEUR: null, planned: true }
  if (typeof raw === 'number') return { amountEUR: raw, planned: false }
  if (isErrorString(raw)) {
    issues.push({ sheet: tab, cell: ref, kind: 'ref-error', detail: `error value "${raw}" at ${ref}`, raw })
    return { amountEUR: null, planned: false }
  }
  issues.push({ sheet: tab, cell: ref, kind: 'bad-number', detail: `non-numeric value "${raw}" at ${ref}`, raw })
  return { amountEUR: null, planned: false }
}

interface IncomeResult { income: Tx[]; carryover: number | null }

/** Income block: A2:B{INCOME_LAST_ROW}. Carryover row (label 'Last Month
 * Balance') is recorded separately, never pushed as a Tx. */
function parseIncomeBlock(tab: string, values: (string | number | null)[][], issues: ParserIssue[]): IncomeResult {
  const income: Tx[] = []
  let carryover: number | null = null
  for (let row = 2; row <= INCOME_LAST_ROW; row++) {
    const labelRaw = cell(values, `A${row}`)
    if (isBlank(labelRaw)) continue // fully empty (or label-less) row — not data
    const label = String(labelRaw).trim()
    const norm = normLabel(label)
    const amountRef = `B${row}`
    const amountRaw = cell(values, amountRef)
    if (norm === CARRYOVER_LABEL) {
      const { amountEUR } = readAmount(amountRaw, tab, amountRef, issues)
      carryover = amountEUR
      continue
    }
    const { amountEUR, planned } = readAmount(amountRaw, tab, amountRef, issues)
    income.push({ tab, row, label, normLabel: norm, amountEUR, kind: 'income', planned, household: false })
  }
  return { income, carryover }
}

/** Expense block: C2:D{EXPENSE_LAST_ROW}. Blank D = planned/unpaid, not zero. */
function parseExpenseBlock(tab: string, values: (string | number | null)[][], issues: ParserIssue[]): Tx[] {
  const expenses: Tx[] = []
  for (let row = 2; row <= EXPENSE_LAST_ROW; row++) {
    const labelRaw = cell(values, `C${row}`)
    if (isBlank(labelRaw)) continue
    const label = String(labelRaw).trim()
    const norm = normLabel(label)
    const amountRef = `D${row}`
    const amountRaw = cell(values, amountRef)
    const { amountEUR, planned } = readAmount(amountRaw, tab, amountRef, issues)
    expenses.push({ tab, row, label, normLabel: norm, amountEUR, kind: 'expense', planned, household: false })
  }
  return expenses
}

/** MonthData for tabs that fail period resolution, or as the pre-fill base. */
function emptyMonthData(tab: string, period: Period, era: MonthData['era'], issues: ParserIssue[]): MonthData {
  return {
    tab, period, era,
    income: [], expenses: [], carryover: null,
    summary: { totalIncome: null, totalExpense: null, balance: null, household: null },
    banks: [], bankTotal: null,
    expectedActual: null, balanceAfterFuture: null,
    upcoming: [], issues,
  }
}

/**
 * Parses a month-ledger tab's income + expenses blocks (workbook-map.md §1.1)
 * plus period/era resolution and the carryover chain start value. Never
 * throws: an unrecognized tab name or malformed cell produces a ParserIssue
 * instead. Other MonthData fields (summary/banks/upcoming/...) are left as
 * placeholders for later tasks.
 */
export function parseMonth(tab: string, grids: MonthGrids): MonthData {
  const issues: ParserIssue[] = []
  const period = tabToPeriod(tab)
  if (!period) {
    issues.push({ sheet: tab, kind: 'unknown-tab', detail: `"${tab}" is not a recognized month-ledger tab name` })
    return emptyMonthData(tab, { year: 0, month: 0 }, 'full', issues)
  }
  const era = eraOf(period)
  const { values } = grids
  const { income, carryover } = parseIncomeBlock(tab, values, issues)
  const expenses = parseExpenseBlock(tab, values, issues)
  const base = emptyMonthData(tab, period, era, issues)
  return { ...base, income, expenses, carryover }
}
