// Month-ledger tab parser (workbook-map.md §1). Fills period/era resolution,
// income[], expenses[], carryover, summary, household tagging, bank
// balances, and upcoming items (Tasks 5–7). All blocks route unparseable
// cells through ParserIssue rather than throwing or silently dropping.
import { tabToPeriod, eraOf } from '../lib/period'
import { normLabel } from '../lib/normalize'
import type { MonthData, Tx, ParserIssue, Period, BankAccount, UpcomingItem, Era } from '../types'

export interface MonthGrids {
  values: (string | number | null)[][]
  formulas: Record<string, string>
}

const INCOME_LAST_ROW = 40
const EXPENSE_LAST_ROW = 80
const CARRYOVER_LABEL = 'last month balance'
const BANK_LAST_ROW = 60
const UPCOMING_LAST_ROW = 100
const TOTAL_LABEL = 'total'
const EXPECTED_ACTUAL_LABEL = 'expected-actual'
const BALANCE_AFTER_FUTURE_LABEL = 'balance after future expense'

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

/** Household cell (workbook-map.md §1.2) by era: v2025 tabs moved Household
 * up to F4/G4 (5-row summary); all earlier eras keep it at F6/G6. */
function householdCellFor(era: MonthData['era']): string {
  return era === 'v2025' ? 'G4' : 'G6'
}

/**
 * Reads a summary cell (G1/G2/G3/household) as a number. Blank is *not*
 * expected here (unlike Tx amounts) — any non-number (including blank)
 * records a 'bad-number' issue and resolves to null.
 */
function readSummaryNumber(
  values: (string | number | null)[][], ref: string, tab: string, issues: ParserIssue[]
): number | null {
  const raw = cell(values, ref)
  if (typeof raw === 'number') return raw
  issues.push({ sheet: tab, cell: ref, kind: 'bad-number', detail: `non-numeric summary value "${String(raw)}" at ${ref}`, raw })
  return null
}

interface SummaryResult { summary: MonthData['summary']; householdRows: number[] }

/** Summary block: G1 totalIncome, G2 totalExpense, G3 balance, household cell
 * by era (workbook-map.md §1.2). G5 "Monthly AVG" in v2025 tabs is a stale
 * frozen formula and must never be read here. The household formula (e.g.
 * "=D3+D5") is parsed for its D-row references, which get tagged onto the
 * matching expense Tx rows below. Missing household formula (where the era
 * expects one) → 'missing-formula' issue, no tagging, household summary null. */
function parseSummaryBlock(
  tab: string, era: MonthData['era'], grids: MonthGrids, issues: ParserIssue[]
): SummaryResult {
  const { values, formulas } = grids
  const totalIncome = readSummaryNumber(values, 'G1', tab, issues)
  const totalExpense = readSummaryNumber(values, 'G2', tab, issues)
  const balance = readSummaryNumber(values, 'G3', tab, issues)

  const householdRef = householdCellFor(era)
  const household = readSummaryNumber(values, householdRef, tab, issues)

  const householdRows: number[] = []
  const formula = formulas[householdRef]
  if (!formula) {
    issues.push({
      sheet: tab, cell: householdRef, kind: 'missing-formula',
      detail: `no household formula found at ${householdRef} for era "${era}"`,
    })
  } else {
    const rowMatches = formula.matchAll(/D(\d+)/g)
    for (const m of rowMatches) householdRows.push(Number(m[1]))
  }

  return { summary: { totalIncome, totalExpense, balance, household }, householdRows }
}

/** Scans `col{row}` for rows 2..lastRow for the first cell whose trimmed
 * lowercase value equals `label` exactly. Returns -1 if not found. Used to
 * locate the bank/upcoming `Total` marker rows — never hardcode a row. */
function findLabelRow(
  values: (string | number | null)[][], col: string, lastRow: number, label: string
): number {
  for (let row = 2; row <= lastRow; row++) {
    const raw = cell(values, `${col}${row}`)
    if (isBlank(raw)) continue
    if (String(raw).trim().toLowerCase() === label) return row
  }
  return -1
}

interface BanksResult {
  banks: BankAccount[]; bankTotal: number | null
  expectedActual: number | null; balanceAfterFuture: number | null
}

/** Bank balances block (workbook-map.md §1.1): col I labels / col J amounts,
 * rows 2..{BANK_LAST_ROW}, terminated by the `Total` label (never a fixed
 * row — locate it). Rows above `Total` become BankAccount[]; the `Total`
 * row's J is bankTotal. After `Total`, scan by label PREFIX (not fixed
 * offset) for `Expected-Actual` and `Balance After future Expense` — any
 * other row in between (e.g. old scratch/debt rows) is ignored and its J
 * cell is never read, so a stray `#REF!` there produces no issue. Missing
 * `Total` marker → 'marker-not-found' issue, everything empty/null. */
function parseBanksBlock(tab: string, values: (string | number | null)[][], issues: ParserIssue[]): BanksResult {
  const totalRow = findLabelRow(values, 'I', BANK_LAST_ROW, TOTAL_LABEL)
  if (totalRow === -1) {
    issues.push({
      sheet: tab, kind: 'marker-not-found',
      detail: `bank "Total" label not found in column I (rows 2-${BANK_LAST_ROW})`,
    })
    return { banks: [], bankTotal: null, expectedActual: null, balanceAfterFuture: null }
  }

  const banks: BankAccount[] = []
  for (let row = 2; row < totalRow; row++) {
    const labelRaw = cell(values, `I${row}`)
    if (isBlank(labelRaw)) continue
    const name = String(labelRaw).trim()
    const amountRef = `J${row}`
    const amountRaw = cell(values, amountRef)
    const { amountEUR } = readAmount(amountRaw, tab, amountRef, issues)
    if (amountEUR !== null) {
      banks.push({ name, amountEUR })
    } else if (isBlank(amountRaw)) {
      // BankAccount.amountEUR is non-nullable, so a blank amount can't be
      // kept — but dropping the row must never be silent. #REF!/bad-number
      // cases already got a 'ref-error'/'bad-number' issue from readAmount
      // above, so only the plain-blank case needs its own issue here.
      issues.push({
        sheet: tab, cell: amountRef, kind: 'dropped-row',
        detail: `bank account "${name}" at ${amountRef} has a blank amount — dropped from banks[]`,
        raw: amountRaw,
      })
    }
  }

  const bankTotalRef = `J${totalRow}`
  const { amountEUR: bankTotal } = readAmount(cell(values, bankTotalRef), tab, bankTotalRef, issues)

  let expectedActual: number | null = null
  let balanceAfterFuture: number | null = null
  // Scans every remaining row to BANK_LAST_ROW rather than stopping once both
  // labels are found; a later row with the same label prefix would silently
  // overwrite the earlier match — accepted, not observed in any fixture.
  for (let row = totalRow + 1; row <= BANK_LAST_ROW; row++) {
    const labelRaw = cell(values, `I${row}`)
    if (isBlank(labelRaw)) continue
    const label = String(labelRaw).trim().toLowerCase()
    const amountRef = `J${row}`
    if (label.startsWith(EXPECTED_ACTUAL_LABEL)) {
      expectedActual = readAmount(cell(values, amountRef), tab, amountRef, issues).amountEUR
    } else if (label.startsWith(BALANCE_AFTER_FUTURE_LABEL)) {
      balanceAfterFuture = readAmount(cell(values, amountRef), tab, amountRef, issues).amountEUR
    }
  }

  return { banks, bankTotal, expectedActual, balanceAfterFuture }
}

/** Upcoming block (workbook-map.md §1.1): col M name / N total / O to-pay,
 * rows 2..{UPCOMING_LAST_ROW}, terminated by the `Total` label (row *varies*
 * per workbook-map.md §1.4 — always locate by label). Missing `Total`
 * marker → 'marker-not-found' issue, empty array. */
function parseUpcomingBlock(tab: string, values: (string | number | null)[][], issues: ParserIssue[]): UpcomingItem[] {
  const totalRow = findLabelRow(values, 'M', UPCOMING_LAST_ROW, TOTAL_LABEL)
  if (totalRow === -1) {
    issues.push({
      sheet: tab, kind: 'marker-not-found',
      detail: `upcoming "Total" label not found in column M (rows 2-${UPCOMING_LAST_ROW})`,
    })
    return []
  }

  const upcoming: UpcomingItem[] = []
  for (let row = 2; row < totalRow; row++) {
    const labelRaw = cell(values, `M${row}`)
    if (isBlank(labelRaw)) continue
    const name = String(labelRaw).trim()
    const totalRef = `N${row}`
    const toPayRef = `O${row}`
    const total = readAmount(cell(values, totalRef), tab, totalRef, issues).amountEUR
    const toPay = readAmount(cell(values, toPayRef), tab, toPayRef, issues).amountEUR
    upcoming.push({ name, total, toPay })
  }
  return upcoming
}

/** Era gating for the bank-balances block (workbook-map.md §1.2): absent in
 * 2019v1, present from JUN in 2019v2 (i.e. for the whole 2019v2 era), and
 * always present in `full`/`v2025`. */
function banksExpectedFor(era: Era): boolean {
  return era !== '2019v1'
}

/** Era gating for the upcoming block (workbook-map.md §1.2): absent in
 * 2019v1, present only from JUL in 2019v2 (JUN has banks but not upcoming),
 * always present in `full`/`v2025`. */
function upcomingExpectedFor(era: Era, period: Period): boolean {
  if (era === '2019v1') return false
  if (era === '2019v2') return period.month >= 7
  return true
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
 * Parses a month-ledger tab's income/expenses/summary/bank/upcoming blocks
 * (workbook-map.md §1.1) plus period/era resolution and the carryover chain
 * start value. Never throws: an unrecognized tab name or malformed cell
 * produces a ParserIssue instead.
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
  const { summary, householdRows } = parseSummaryBlock(tab, era, grids, issues)
  const householdRowSet = new Set(householdRows)
  for (const tx of expenses) {
    if (householdRowSet.has(tx.row)) tx.household = true
  }

  let banks: BankAccount[] = []
  let bankTotal: number | null = null
  let expectedActual: number | null = null
  let balanceAfterFuture: number | null = null
  if (banksExpectedFor(era)) {
    ;({ banks, bankTotal, expectedActual, balanceAfterFuture } = parseBanksBlock(tab, values, issues))
  }

  let upcoming: UpcomingItem[] = []
  if (upcomingExpectedFor(era, period)) {
    upcoming = parseUpcomingBlock(tab, values, issues)
  }

  const base = emptyMonthData(tab, period, era, issues)
  return {
    ...base, income, expenses, carryover, summary,
    banks, bankTotal, expectedActual, balanceAfterFuture, upcoming,
  }
}
