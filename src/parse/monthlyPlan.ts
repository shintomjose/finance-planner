// MONTHLY_PLAN special-tab parser (workbook-map.md §2.1, plan2-task-3-brief).
// ~13 fixed-position blocks (this tab, unlike month-ledger tabs, never varies
// row/col position across eras — a single live tab, hardcoded coordinates are
// the correct approach, same trade-off as month.ts's INCOME_LAST_ROW etc).
// Binance copy (A65:C95) is deliberately never read — BINANCE tab is the
// source of truth (workbook-map.md §2.1/§2.4) — no cell in that range is
// touched by any block function below.
import type { Budget, InvestmentSnapshot, LogEntry, ParserIssue } from '../types'
import type { SpecialGrids } from '../data/specialTabs'
import { cellAt, isBlank, isErrorString, readDateAt, readNumberAt } from './cells'

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

// cell/isBlank/isErrorString and the readNumber/readDate serial+delimited-date
// machinery now live in cells.ts (shared with mutualFunds.ts, Plan 2 Task 4 —
// see that file's header comment). `cell` keeps its short local name via an
// alias since every call site in this file already uses it.
const cell = cellAt

/** Text-concat subtotal footer cells (workbook-map.md §3): a string of the
 * documented concat shape — `… & " Total €: " & TEXT(SUM(...),"0.00")` —
 * i.e. contains "Total" AND a digit somewhere (the rendered SUM). Ignored
 * silently per parser rules, never routed to ParserIssue. A string that
 * merely mentions "total" with no accompanying number (e.g. a stray label
 * or comment) does NOT match this shape and falls through to the normal
 * 'bad-number' path instead — reviewer finding: a bare /total/i substring
 * test silently discarded ANY string containing that word, which is too
 * broad and risks swallowing real bad data on the live sheet. */
const isTotalFooterString = (v: unknown): v is string =>
  typeof v === 'string' && /total/i.test(v) && /\d/.test(v)

/** Thin wrapper binding this file's SHEET constant into cells.ts's shared readNumberAt. */
function readNumber(values: (string | number | null)[][], ref: string, issues: ParserIssue[]): number | null {
  return readNumberAt(values, ref, SHEET, issues)
}

// `blank` distinguishes a truly-empty anchor cell from every other
// non-present case (footer-skip) — resolveLogRow needs that distinction to
// implement the "date present, amount not yet entered" planned-row rule
// below without also reviving footer/subtotal rows.
interface Anchor { value: number | null; present: boolean; blank: boolean }

/**
 * Reads a log block's "anchor" amount cell — the cell whose presence decides
 * whether a row is real data. Blank → not a row (present: false, blank: true,
 * no issue). A text-concat subtotal footer string → also not a row (present:
 * false, blank: false, no issue — ignored per parser rules, never flagged).
 * '#REF!'/other bad string → IS a row (present: true) but with a null value
 * and a recorded issue, same as every other unparseable-but-present cell in
 * this parser.
 */
function readAnchor(values: (string | number | null)[][], ref: string, issues: ParserIssue[]): Anchor {
  const raw = cell(values, ref)
  if (isBlank(raw)) return { value: null, present: false, blank: true }
  if (typeof raw === 'number') return { value: raw, present: true, blank: false }
  if (isTotalFooterString(raw)) return { value: null, present: false, blank: false }
  if (isErrorString(raw)) {
    issues.push({ sheet: SHEET, cell: ref, kind: 'ref-error', detail: `error value "${raw}" at ${ref}`, raw })
    return { value: null, present: true, blank: false }
  }
  issues.push({ sheet: SHEET, cell: ref, kind: 'bad-number', detail: `non-numeric value "${raw}" at ${ref}`, raw })
  return { value: null, present: true, blank: false }
}

interface LogRow { include: boolean; date: string | null; amount: number | null }

/**
 * Resolves one log-block row from its date cell + anchor (amount) cell.
 * Three outcomes:
 *  - anchor has a value, or is a bad/error cell (present) → include, with
 *    whatever amount/issue readAnchor already produced.
 *  - anchor is genuinely blank BUT the date cell is non-blank → include
 *    anyway, amount: null, NO issue — locked decision: this is a
 *    planned/not-yet-entered log line (same "blank = planned" semantics as
 *    a blank month-ledger expense amount), not an error.
 *  - both blank, or anchor was a footer/subtotal string → not a row at all.
 */
function resolveLogRow(
  values: (string | number | null)[][], issues: ParserIssue[], dateRef: string, amountRef: string
): LogRow {
  const anchor = readAnchor(values, amountRef, issues)
  if (anchor.present) {
    return { include: true, date: readDate(values, dateRef, issues), amount: anchor.value }
  }
  if (anchor.blank && !isBlank(cell(values, dateRef))) {
    return { include: true, date: readDate(values, dateRef, issues), amount: null }
  }
  return { include: false, date: null, amount: null }
}

/** Thin wrapper binding this file's SHEET constant into cells.ts's shared readDateAt. */
function readDate(values: (string | number | null)[][], ref: string, issues: ParserIssue[]): string | null {
  return readDateAt(values, ref, SHEET, issues)
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

/** Badminton gear (EUR) block, full bounding box F30:G64: F date, G amount,
 * data rows 31-64 (row 30 is the header). */
function parseGearEURBlock(values: (string | number | null)[][], issues: ParserIssue[]): LogEntry[] {
  const out: LogEntry[] = []
  for (let row = 31; row <= 64; row++) {
    const r = resolveLogRow(values, issues, `F${row}`, `G${row}`)
    if (!r.include) continue
    out.push({ log: 'gear', date: r.date, fields: { amountEUR: r.amount } })
  }
  return out
}

/** Badminton gear (INR) block, full bounding box L50:N62: L date, M item,
 * N amount, data rows 51-62 (row 50 is the header). */
function parseGearINRBlock(values: (string | number | null)[][], issues: ParserIssue[]): LogEntry[] {
  const out: LogEntry[] = []
  for (let row = 51; row <= 62; row++) {
    const r = resolveLogRow(values, issues, `L${row}`, `N${row}`)
    if (!r.include) continue
    const itemRaw = cell(values, `M${row}`)
    const item = isBlank(itemRaw) ? null : String(itemRaw).trim()
    out.push({ log: 'gear', date: r.date, fields: { amountINR: r.amount, item } })
  }
  return out
}

/** Gym log block, full bounding box H48:J74: H date, I amount, data rows
 * 49-74 (row 48 is the header). */
function parseGymBlock(values: (string | number | null)[][], issues: ParserIssue[]): LogEntry[] {
  const out: LogEntry[] = []
  for (let row = 49; row <= 74; row++) {
    const r = resolveLogRow(values, issues, `H${row}`, `I${row}`)
    if (!r.include) continue
    out.push({ log: 'gym', date: r.date, fields: { amountEUR: r.amount } })
  }
  return out
}

/** Petrol log block, full bounding box F81:K153: F date, G litres, H amount
 * (anchor), I per-litre, J km (often blank), data rows 82-152 (row 81 is the
 * header). */
function parsePetrolBlock(values: (string | number | null)[][], issues: ParserIssue[]): LogEntry[] {
  const out: LogEntry[] = []
  for (let row = 82; row <= 152; row++) {
    const r = resolveLogRow(values, issues, `F${row}`, `H${row}`)
    if (!r.include) continue
    const litres = readNumber(values, `G${row}`, issues)
    const perLitre = readNumber(values, `I${row}`, issues)
    const km = readNumber(values, `J${row}`, issues)
    out.push({ log: 'petrol', date: r.date, fields: { litres, amountEUR: r.amount, perLitre, km } })
  }
  return out
}

/** Alcohol log block (A126:C161, already the full bounding box): A
 * pre-numbered scaffold running number (present on every templated row —
 * not data on its own), B date, C amount (anchor). A row only counts once C
 * holds a real value, OR B holds a date with C still blank (planned/not-yet
 * logged) — pure scaffold-only rows (blank B/C) are skipped silently. */
function parseAlcoholBlock(values: (string | number | null)[][], issues: ParserIssue[]): LogEntry[] {
  const out: LogEntry[] = []
  for (let row = 126; row <= 161; row++) {
    const r = resolveLogRow(values, issues, `B${row}`, `C${row}`)
    if (!r.include) continue
    out.push({ log: 'alcohol', date: r.date, fields: { amountEUR: r.amount } })
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
