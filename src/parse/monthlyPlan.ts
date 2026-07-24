// MONTHLY_PLAN special-tab parser (workbook-map.md §2.1, plan2-task-3-brief).
// ~13 fixed-position blocks (this tab, unlike month-ledger tabs, never varies
// row/col position across eras — a single live tab, hardcoded coordinates are
// the correct approach, same trade-off as month.ts's INCOME_LAST_ROW etc).
// Binance copy (A65:C95) is deliberately never read — BINANCE tab is the
// source of truth (workbook-map.md §2.1/§2.4) — no cell in that range is
// touched by any block function below.
import type { Budget, InvestmentSnapshot, LogEntry, ParserIssue } from '../types'
import type { SpecialGrids } from '../data/specialTabs'

const SHEET = 'MONTHLY_PLAN'

export interface MonthlyPlanData {
  budget: Budget[]
  budgetTotals: { income: number | null; expense: number | null; surplus: number | null }
  loan: { principal: number | null; installments: { n: number; amountEUR: number | null }[]; paidToDate: number | null }
  savingsSnapshots: { label: string; amountEUR: number | null }[]
  projection: { ratePct: number | null; yearlyContribution: number | null; rows: { year: number | null; valueEUR: number | null }[] }
  sbiLife: { date: string | null; amountINR: number | null }[]
  logs: LogEntry[]
  upstocks: InvestmentSnapshot[]
  issues: ParserIssue[]
}

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

// Type predicate (not just boolean) so downstream string-only calls (e.g.
// parseDelimitedDate) narrow correctly after an `if (isBlank(raw)) return`.
const isBlank = (v: string | number | null): v is null | '' => v === null || v === ''

/** Sheets error strings all start with '#' (#REF!, #N/A, #DIV/0!, ...). */
const isErrorString = (v: unknown): v is string => typeof v === 'string' && v.startsWith('#')

/** Text-concat subtotal footer cells (workbook-map.md §3): a string containing
 * "Total" where a number was expected — e.g. `… & " Total €: " & TEXT(SUM(...),"0.00")`.
 * Ignored silently per parser rules, never routed to ParserIssue. */
const isTotalFooterString = (v: unknown): v is string => typeof v === 'string' && /total/i.test(v)

/**
 * Reads a cell expected to hold a plain number. Blank → null quietly.
 * '#REF!'/error string → null + 'ref-error'. Any other non-numeric string →
 * null + 'bad-number'.
 */
function readNumber(values: (string | number | null)[][], ref: string, issues: ParserIssue[]): number | null {
  const raw = cell(values, ref)
  if (isBlank(raw)) return null
  if (typeof raw === 'number') return raw
  if (isErrorString(raw)) {
    issues.push({ sheet: SHEET, cell: ref, kind: 'ref-error', detail: `error value "${raw}" at ${ref}`, raw })
    return null
  }
  issues.push({ sheet: SHEET, cell: ref, kind: 'bad-number', detail: `non-numeric value "${raw}" at ${ref}`, raw })
  return null
}

interface Anchor { value: number | null; present: boolean }

/**
 * Reads a log block's "anchor" amount cell — the cell whose presence decides
 * whether a row is real data. Blank → not a row (present: false, no issue).
 * A text-concat subtotal footer string → also not a row (present: false, no
 * issue — ignored per parser rules, never flagged). '#REF!'/other bad string →
 * IS a row (present: true) but with a null value and a recorded issue, same
 * as every other unparseable-but-present cell in this parser.
 */
function readAnchor(values: (string | number | null)[][], ref: string, issues: ParserIssue[]): Anchor {
  const raw = cell(values, ref)
  if (isBlank(raw)) return { value: null, present: false }
  if (typeof raw === 'number') return { value: raw, present: true }
  if (isTotalFooterString(raw)) return { value: null, present: false }
  if (isErrorString(raw)) {
    issues.push({ sheet: SHEET, cell: ref, kind: 'ref-error', detail: `error value "${raw}" at ${ref}`, raw })
    return { value: null, present: true }
  }
  issues.push({ sheet: SHEET, cell: ref, kind: 'bad-number', detail: `non-numeric value "${raw}" at ${ref}`, raw })
  return { value: null, present: true }
}

// Sheets/Excel serial date epoch: serial 25569 == 1970-01-01 (UNFORMATTED_VALUE
// + SERIAL_NUMBER date rendering, see api/sheets.ts).
const SHEET_EPOCH_SERIAL = 25569
const MS_PER_DAY = 86400000

function serialToISODate(serial: number): string | null {
  const ms = (serial - SHEET_EPOCH_SERIAL) * MS_PER_DAY
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

// Accepts 'DD-MM-YYYY' and 'DD.MM.YYYY' (workbook-map.md §3 mixed date encodings).
const DELIMITED_DATE_RE = /^(\d{1,2})[.-](\d{1,2})[.-](\d{4})$/

function parseDelimitedDate(raw: string): string | null {
  const m = DELIMITED_DATE_RE.exec(raw.trim())
  if (!m) return null
  const day = Number(m[1])
  const month = Number(m[2])
  const year = Number(m[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${year}-${pad(month)}-${pad(day)}`
}

/**
 * Reads a cell expected to hold a date. Blank → null quietly. Numeric →
 * serial-date conversion. '#REF!' → null + 'ref-error'. Any other
 * non-blank unparseable value → null + 'bad-date'.
 */
function readDate(values: (string | number | null)[][], ref: string, issues: ParserIssue[]): string | null {
  const raw = cell(values, ref)
  if (isBlank(raw)) return null
  if (typeof raw === 'number') {
    const iso = serialToISODate(raw)
    if (iso === null) {
      issues.push({ sheet: SHEET, cell: ref, kind: 'bad-date', detail: `unparseable serial date ${raw} at ${ref}`, raw })
    }
    return iso
  }
  if (isErrorString(raw)) {
    issues.push({ sheet: SHEET, cell: ref, kind: 'ref-error', detail: `error value "${raw}" at ${ref}`, raw })
    return null
  }
  const iso = parseDelimitedDate(raw)
  if (iso === null) {
    issues.push({ sheet: SHEET, cell: ref, kind: 'bad-date', detail: `unparseable date "${raw}" at ${ref}`, raw })
  }
  return iso
}

/**
 * Budget plan block (A1:D27). Expense pairs B2:C25 (label/amount) become
 * `Budget[]`. Income lines A2:A5 have no paired amount column in this sheet
 * (fixture-design decision, see task-3 report) — they're read only so a
 * '#REF!'/bad-number cell there still surfaces as a ParserIssue, but no
 * per-line income breakdown is modeled; only the A26 total feeds
 * `budgetTotals.income`. C27 = expense total, D2 = surplus (a standalone
 * summary cell, same pattern as month.ts's F1:G9 corner box).
 */
function parseBudgetBlock(
  values: (string | number | null)[][], issues: ParserIssue[]
): { budget: Budget[]; budgetTotals: MonthlyPlanData['budgetTotals'] } {
  const budget: Budget[] = []
  for (let row = 2; row <= 25; row++) {
    const labelRaw = cell(values, `B${row}`)
    if (isBlank(labelRaw)) continue
    const category = String(labelRaw).trim()
    const amountRef = `C${row}`
    const amountRaw = cell(values, amountRef)
    const amount = readNumber(values, amountRef, issues)
    if (amount === null) {
      // readNumber already issued for error/bad-number; a genuinely blank
      // amount on a labeled budget row still can't populate a non-nullable
      // Budget.plannedMonthly, so it needs its own issue (never a silent drop).
      if (isBlank(amountRaw)) {
        issues.push({
          sheet: SHEET, cell: amountRef, kind: 'bad-number',
          detail: `budget category "${category}" at ${amountRef} has no amount — excluded from budget[]`,
          raw: amountRaw,
        })
      }
      continue
    }
    budget.push({ category, plannedMonthly: amount })
  }

  for (let row = 2; row <= 5; row++) readNumber(values, `A${row}`, issues) // side-effect only, see doc comment above

  const income = readNumber(values, 'A26', issues)
  const expense = readNumber(values, 'C27', issues)
  const surplus = readNumber(values, 'D2', issues)
  return { budget, budgetTotals: { income, expense, surplus } }
}

/** Commerzbank loan block (I1:J45): J1 principal, 36 installments I2:J37
 * (I = installment number, J = amount), J45 paid-to-date. */
function parseLoanBlock(values: (string | number | null)[][], issues: ParserIssue[]): MonthlyPlanData['loan'] {
  const principal = readNumber(values, 'J1', issues)
  const installments: { n: number; amountEUR: number | null }[] = []
  for (let row = 2; row <= 37; row++) {
    const nRaw = cell(values, `I${row}`)
    if (isBlank(nRaw)) continue
    if (typeof nRaw !== 'number') {
      issues.push({ sheet: SHEET, cell: `I${row}`, kind: 'bad-number', detail: `non-numeric installment index "${nRaw}" at I${row}`, raw: nRaw })
      continue
    }
    const amountEUR = readNumber(values, `J${row}`, issues)
    installments.push({ n: nRaw, amountEUR })
  }
  const paidToDate = readNumber(values, 'J45', issues)
  return { principal, installments, paidToDate }
}

/** Savings snapshots block (K1:N7): K label / L amount, rows 2-7. */
function parseSavingsBlock(values: (string | number | null)[][], issues: ParserIssue[]): MonthlyPlanData['savingsSnapshots'] {
  const out: MonthlyPlanData['savingsSnapshots'] = []
  for (let row = 2; row <= 7; row++) {
    const labelRaw = cell(values, `K${row}`)
    if (isBlank(labelRaw)) continue
    const label = String(labelRaw).trim()
    const amountEUR = readNumber(values, `L${row}`, issues)
    out.push({ label, amountEUR })
  }
  return out
}

/** 2035 projection block (K11:R26). Fixture-design layout: K11/L11 rate %,
 * K12/L12 yearly contribution, K13/L13 header row, K14:L26 year/value rows. */
function parseProjectionBlock(values: (string | number | null)[][], issues: ParserIssue[]): MonthlyPlanData['projection'] {
  const ratePct = readNumber(values, 'L11', issues)
  const yearlyContribution = readNumber(values, 'L12', issues)
  const rows: { year: number | null; valueEUR: number | null }[] = []
  for (let row = 14; row <= 26; row++) {
    const yearRef = `K${row}`
    const yearRaw = cell(values, yearRef)
    if (isBlank(yearRaw)) continue
    let year: number | null
    if (typeof yearRaw === 'number') {
      year = yearRaw
    } else {
      issues.push({ sheet: SHEET, cell: yearRef, kind: 'bad-number', detail: `non-numeric year "${yearRaw}" at ${yearRef}`, raw: yearRaw })
      year = null
    }
    const valueEUR = readNumber(values, `L${row}`, issues)
    rows.push({ year, valueEUR })
  }
  return { ratePct, yearlyContribution, rows }
}

/** SBI Life schedule block (A29:D63): A date, B amount, rows 30-60 (31 semiannual entries). */
function parseSbiBlock(values: (string | number | null)[][], issues: ParserIssue[]): MonthlyPlanData['sbiLife'] {
  const out: MonthlyPlanData['sbiLife'] = []
  for (let row = 30; row <= 60; row++) {
    const dateRaw = cell(values, `A${row}`)
    if (isBlank(dateRaw)) continue
    const date = readDate(values, `A${row}`, issues)
    const amountINR = readNumber(values, `B${row}`, issues)
    out.push({ date, amountINR })
  }
  return out
}

/** Badminton gear (EUR) block (F30:G64): F date, G amount, rows 31-40. */
function parseGearEURBlock(values: (string | number | null)[][], issues: ParserIssue[]): LogEntry[] {
  const out: LogEntry[] = []
  for (let row = 31; row <= 40; row++) {
    const anchor = readAnchor(values, `G${row}`, issues)
    if (!anchor.present) continue
    const date = readDate(values, `F${row}`, issues)
    out.push({ log: 'gear', date, fields: { amountEUR: anchor.value } })
  }
  return out
}

/** Badminton gear (INR) block (L50:N62): L date, M item, N amount, rows 51-60. */
function parseGearINRBlock(values: (string | number | null)[][], issues: ParserIssue[]): LogEntry[] {
  const out: LogEntry[] = []
  for (let row = 51; row <= 60; row++) {
    const anchor = readAnchor(values, `N${row}`, issues)
    if (!anchor.present) continue
    const date = readDate(values, `L${row}`, issues)
    const itemRaw = cell(values, `M${row}`)
    const item = isBlank(itemRaw) ? null : String(itemRaw).trim()
    out.push({ log: 'gear', date, fields: { amountINR: anchor.value, item } })
  }
  return out
}

/** Gym log block (H48:J74): H date, I amount, rows 49-58. */
function parseGymBlock(values: (string | number | null)[][], issues: ParserIssue[]): LogEntry[] {
  const out: LogEntry[] = []
  for (let row = 49; row <= 58; row++) {
    const anchor = readAnchor(values, `I${row}`, issues)
    if (!anchor.present) continue
    const date = readDate(values, `H${row}`, issues)
    out.push({ log: 'gym', date, fields: { amountEUR: anchor.value } })
  }
  return out
}

/** Petrol log block (F81:K153): F date, G litres, H amount (anchor), I per-litre,
 * J km (often blank), rows 82-90. */
function parsePetrolBlock(values: (string | number | null)[][], issues: ParserIssue[]): LogEntry[] {
  const out: LogEntry[] = []
  for (let row = 82; row <= 90; row++) {
    const anchor = readAnchor(values, `H${row}`, issues)
    if (!anchor.present) continue
    const date = readDate(values, `F${row}`, issues)
    const litres = readNumber(values, `G${row}`, issues)
    const perLitre = readNumber(values, `I${row}`, issues)
    const km = readNumber(values, `J${row}`, issues)
    out.push({ log: 'petrol', date, fields: { litres, amountEUR: anchor.value, perLitre, km } })
  }
  return out
}

/** Alcohol log block (A126:C161): A pre-numbered scaffold running number
 * (present on every templated row — not data on its own), B date, C amount
 * (anchor). A row only counts once C holds a real value beyond the running
 * number — scaffold-only rows (blank B/C) are skipped silently. */
function parseAlcoholBlock(values: (string | number | null)[][], issues: ParserIssue[]): LogEntry[] {
  const out: LogEntry[] = []
  for (let row = 126; row <= 161; row++) {
    const anchor = readAnchor(values, `C${row}`, issues)
    if (!anchor.present) continue
    const date = readDate(values, `B${row}`, issues)
    out.push({ log: 'alcohol', date, fields: { amountEUR: anchor.value } })
  }
  return out
}

/** UPSTOCS block (A97:C123): A date, B label(asset)/anchor, C value INR, rows 98-123. */
function parseUpstocksBlock(values: (string | number | null)[][], issues: ParserIssue[]): InvestmentSnapshot[] {
  const out: InvestmentSnapshot[] = []
  for (let row = 98; row <= 123; row++) {
    const labelRaw = cell(values, `B${row}`)
    if (isBlank(labelRaw)) continue
    const asset = String(labelRaw).trim()
    const date = readDate(values, `A${row}`, issues)
    const valueINR = readNumber(values, `C${row}`, issues)
    out.push({ date, source: 'upstocks', asset, valueINR: valueINR ?? undefined })
  }
  return out
}

/**
 * Parses the MONTHLY_PLAN special tab (workbook-map.md §2.1). Never throws:
 * every unparseable-but-present cell routes to `issues` instead. The Binance
 * copy block (A65:C95) is intentionally never read — BINANCE is the source
 * of truth for that data (workbook-map.md §2.4).
 */
export function parseMonthlyPlan(grids: SpecialGrids): MonthlyPlanData {
  const { values } = grids
  const issues: ParserIssue[] = []

  const { budget, budgetTotals } = parseBudgetBlock(values, issues)
  const loan = parseLoanBlock(values, issues)
  const savingsSnapshots = parseSavingsBlock(values, issues)
  const projection = parseProjectionBlock(values, issues)
  const sbiLife = parseSbiBlock(values, issues)
  const gearEUR = parseGearEURBlock(values, issues)
  const gearINR = parseGearINRBlock(values, issues)
  const gym = parseGymBlock(values, issues)
  const petrol = parsePetrolBlock(values, issues)
  const alcohol = parseAlcoholBlock(values, issues)
  const upstocks = parseUpstocksBlock(values, issues)

  return {
    budget, budgetTotals, loan, savingsSnapshots, projection, sbiLife,
    logs: [...gearEUR, ...gearINR, ...gym, ...petrol, ...alcohol],
    upstocks, issues,
  }
}
