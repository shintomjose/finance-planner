// MONTHLY_PLAN special-tab parser (workbook-map.md §2.1, plan2-task-3-brief;
// remapped 2026-07-26 against the real live sheet — see
// .superpowers/sdd/live-run-fixes-report.md for the full corrections list).
// ~13 fixed-position blocks (this tab, unlike month-ledger tabs, never varies
// row/col position across eras — a single live tab, hardcoded coordinates are
// the correct approach, same trade-off as month.ts's INCOME_LAST_ROW etc).
// Binance copy (A65:C95) is deliberately never read — BINANCE is the
// source of truth (workbook-map.md §2.1/§2.4) — no cell in that range is
// touched by any block function below.
import type { Budget, InvestmentSnapshot, LogEntry, ParserIssue } from '../types'
import type { SpecialGrids } from '../data/specialTabs'
import { cellAt, isBlank, isErrorString, readDateAt, readNumberAt } from './cells'

const SHEET = 'MONTHLY_PLAN'

export interface MonthlyPlanData {
  budget: Budget[]
  budgetTotals: { income: number | null; expense: number | null; surplus: number | null }
  loan: {
    principal: number | null
    termMonths: number | null
    interestEUR: number | null
    totalEUR: number | null
    monthlyEUR: number | null
    installments: { n: number; amountEUR: number | null }[]
    paidToDate: number | null
  }
  savingsSnapshots: { label: string; amountEUR: number | null }[]
  projection: { ratePct: number | null; yearlyContribution: number | null; rows: { year: number | null; valueEUR: number | null }[] }
  sbiLife: { date: string | null; amountINR: number | null }[]
  /** Shinto's SBI Life total — C61 (owner correction 2026-07-31 #3: G8 is
   * the combined family total and would double-count Sandra, so it is NOT
   * read; C61 under the schedule is Shinto's own). The synthetic fixture's
   * footer sits at row 62, so a short label-tolerant scan of rows 61-70
   * covers both. ₹. */
  shintoSbiLifeINR: number | null
  /** SANDRA SBI LIFE block (owner 2026-07-31): located by header label
   * anywhere in the grid — dated ₹ contributions + the block's own TOTAL.
   * Absent block → empty rows, null total (no issue: optional block). */
  sandraSbiLife: { rows: { date: string | null; amountINR: number | null }[]; totalINR: number | null }
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

/**
 * Reads a cell expected to hold a number, but silently (never issues) when
 * the raw value is a plain non-error string — used inside the projection
 * block (correction #3, live-run 2026-07-26) where header/label text (e.g.
 * "€ SAVINGS") can land in a cell this parser would otherwise read as a
 * number. A genuine '#REF!'/error string is still surfaced (it's real bad
 * data, not a mis-scoped header), same as readNumber elsewhere.
 */
function readNumberOrSkip(values: (string | number | null)[][], ref: string, issues: ParserIssue[]): number | null {
  const raw = cell(values, ref)
  if (isBlank(raw)) return null
  if (typeof raw === 'number') return raw
  if (isErrorString(raw)) {
    issues.push({ sheet: SHEET, cell: ref, kind: 'ref-error', detail: `error value "${raw}" at ${ref}`, raw })
    return null
  }
  return null // plain string (e.g. a header/label) -> silent skip, no issue
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
 *
 * Live-run correction #1 (2026-07-26): a labeled row with a genuinely BLANK
 * amount cell is planned-semantics (like a blank month-ledger expense
 * amount) — it's still a real budget category, just with no figure entered
 * yet. It's now INCLUDED with `plannedMonthly: null` and no issue. A
 * non-blank but unparseable amount (bad-number/#REF!) is unchanged: readNumber
 * already records the issue, and that row is excluded from budget[].
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
    if (amount === null && !isBlank(amountRaw)) {
      // Non-blank but unparseable — readNumber already issued (bad-number/
      // ref-error); exclude the row, same as before this correction.
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

/** Known label -> loan-field mapping for the I2:I6 label rows (correction #2,
 * live-run 2026-07-26). Matched case-insensitively, trimmed. */
const LOAN_LABELS: Record<string, keyof Pick<MonthlyPlanData['loan'], 'principal' | 'termMonths' | 'interestEUR' | 'totalEUR' | 'monthlyEUR'>> = {
  amount: 'principal',
  term: 'termMonths',
  interest: 'interestEUR',
  total: 'totalEUR',
  monthly: 'monthlyEUR',
}

/**
 * Commerzbank loan block, real layout (correction #2, live-run 2026-07-26):
 * I2:I6 are LABELS (AMOUNT/TERM/INTEREST/TOTAL/MONTHLY, case-insensitive)
 * with their values in J2:J6 — matched by label text, not fixed field
 * order. Installment rows 7-44: a row counts only when I holds a plain
 * NUMBER *and* J holds a plain NUMBER; any string in either cell across
 * that range is a silent skip (no bad-number issue — the live sheet's
 * installment area sometimes carries stray text, e.g. "N/A"/"TBD", which
 * isn't malformed data so much as a not-yet-scheduled row). J45 = paid to
 * date, unchanged position.
 */
function parseLoanBlock(values: (string | number | null)[][], issues: ParserIssue[]): MonthlyPlanData['loan'] {
  let principal: number | null = null
  let termMonths: number | null = null
  let interestEUR: number | null = null
  let totalEUR: number | null = null
  let monthlyEUR: number | null = null

  for (let row = 2; row <= 6; row++) {
    const labelRaw = cell(values, `I${row}`)
    if (typeof labelRaw !== 'string') continue
    const field = LOAN_LABELS[labelRaw.trim().toLowerCase()]
    if (!field) continue
    const value = readNumber(values, `J${row}`, issues)
    if (field === 'principal') principal = value
    else if (field === 'termMonths') termMonths = value
    else if (field === 'interestEUR') interestEUR = value
    else if (field === 'totalEUR') totalEUR = value
    else if (field === 'monthlyEUR') monthlyEUR = value
  }

  const installments: { n: number; amountEUR: number | null }[] = []
  for (let row = 7; row <= 44; row++) {
    const nRaw = cell(values, `I${row}`)
    if (typeof nRaw !== 'number') continue // string/blank -> silent skip, no issue
    const jRaw = cell(values, `J${row}`)
    if (typeof jRaw !== 'number') continue // string/blank -> silent skip, no issue
    installments.push({ n: nRaw, amountEUR: jRaw })
  }
  const paidToDate = readNumber(values, 'J45', issues)
  return { principal, termMonths, interestEUR, totalEUR, monthlyEUR, installments, paidToDate }
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

/**
 * 2035 projection block (K11:R26). Fixture-design layout: K11/L11 rate %,
 * K12/L12 yearly contribution, K13/L13 header row, K14:L26 year/value rows.
 *
 * Live-run correction #3 (2026-07-26): the live sheet mixes header/label
 * text into cells this parser reads as numbers (e.g. "€ SAVINGS" at L12,
 * confirmed live) — any such plain string is now a silent skip (no
 * bad-number issue), via `readNumberOrSkip`. Numbers-only extraction is
 * otherwise unchanged: a genuine '#REF!'/error string still surfaces.
 */
function parseProjectionBlock(values: (string | number | null)[][], issues: ParserIssue[]): MonthlyPlanData['projection'] {
  const ratePct = readNumberOrSkip(values, 'L11', issues)
  const yearlyContribution = readNumberOrSkip(values, 'L12', issues)
  const rows: { year: number | null; valueEUR: number | null }[] = []
  for (let row = 14; row <= 26; row++) {
    const yearRef = `K${row}`
    const yearRaw = cell(values, yearRef)
    if (isBlank(yearRaw)) continue
    const year = readNumberOrSkip(values, yearRef, issues)
    const valueEUR = readNumberOrSkip(values, `L${row}`, issues)
    rows.push({ year, valueEUR })
  }
  return { ratePct, yearlyContribution, rows }
}

/**
 * SBI Life schedule block, real layout (correction #4, live-run 2026-07-26):
 * row 29 is a header/title row; A30+ is a pre-numbered running index
 * (1..31, a plain NUMBER) that is never date-parsed — it's ignored
 * entirely. B = date, C = amount, D unused. Row inclusion is keyed off B
 * (the date cell), same convention as every other date-driven block scan
 * in this file. Bound stays 30-60 (31 entries), so a "Total" footer
 * anywhere beyond row 60 (e.g. row 62 on the live sheet) is never reached.
 */
function parseSbiBlock(values: (string | number | null)[][], issues: ParserIssue[]): MonthlyPlanData['sbiLife'] {
  const out: MonthlyPlanData['sbiLife'] = []
  for (let row = 30; row <= 60; row++) {
    const dateRaw = cell(values, `B${row}`)
    if (isBlank(dateRaw)) continue
    const date = readDate(values, `B${row}`, issues)
    const amountINR = readNumber(values, `C${row}`, issues)
    out.push({ date, amountINR })
  }
  return out
}

/** Column index → A1 letter (grid is A..R, single letters suffice). */
const colName = (c: number): string => String.fromCharCode(65 + c)

/**
 * Shinto's SBI Life total — C61 on the live sheet (owner 2026-07-31 #3);
 * the fixture's "Total" footer sits at row 62, so rows 61-70 are scanned:
 * the first numeric-bearing C cell that is row 61 itself or Total-labelled
 * in B wins. Nothing found → null, no issue.
 */
function parseShintoSbiLife(values: (string | number | null)[][], issues: ParserIssue[]): number | null {
  for (let row = 61; row <= 70; row++) {
    const amountRaw = cell(values, `C${row}`)
    if (isBlank(amountRaw)) continue
    const labelRaw = cell(values, `B${row}`)
    const isTotalLabel = typeof labelRaw === 'string' && /total/i.test(labelRaw)
    if (row === 61 || isTotalLabel) return readNumber(values, `C${row}`, issues)
  }
  return null
}

/**
 * SANDRA SBI LIFE block (owner 2026-07-31): position unknown/unpinned, so
 * the header cell is located by label scan over the whole grid (parser
 * rule: locate by label where position varies). Layout below the header:
 * date in the header's own column, ₹ amount one column right; blank rows
 * are skipped; a row whose label cell contains "total" ends the block and
 * supplies `totalINR`. Missing header → empty result, no issue.
 */
function parseSandraSbiBlock(
  values: (string | number | null)[][],
  issues: ParserIssue[],
): MonthlyPlanData['sandraSbiLife'] {
  let headerRow = -1
  let headerCol = -1
  outer: for (let r = 0; r < values.length; r++) {
    const rowVals = values[r] ?? []
    for (let c = 0; c < rowVals.length; c++) {
      const v = rowVals[c]
      if (typeof v === 'string' && /sandra/i.test(v) && /sbi/i.test(v)) {
        headerRow = r + 1
        headerCol = c
        break outer
      }
    }
  }
  if (headerRow < 0) return { rows: [], totalINR: null }

  const rows: { date: string | null; amountINR: number | null }[] = []
  let totalINR: number | null = null
  for (let row = headerRow + 1; row <= headerRow + 40; row++) {
    const labelRef = `${colName(headerCol)}${row}`
    const amountRef = `${colName(headerCol + 1)}${row}`
    const labelRaw = cell(values, labelRef)
    const amountRaw = cell(values, amountRef)
    if (isBlank(labelRaw) && isBlank(amountRaw)) continue
    if (typeof labelRaw === 'string' && /total/i.test(labelRaw)) {
      totalINR = readNumber(values, amountRef, issues)
      break
    }
    const date = readDate(values, labelRef, issues)
    const amountINR = readNumber(values, amountRef, issues)
    rows.push({ date, amountINR })
  }
  return { rows, totalINR }
}

/**
 * Badminton gear (EUR) block, real layout (correction #5, live-run
 * 2026-07-26): F = item LABEL (no dates in this block at all), G =
 * amountEUR. Row 30 is the header. A text-concat footer string ("Total"
 * + digit) in either column is a silent skip, same convention as every
 * other log block's footer handling.
 */
function parseGearEURBlock(values: (string | number | null)[][], issues: ParserIssue[]): LogEntry[] {
  const out: LogEntry[] = []
  for (let row = 31; row <= 64; row++) {
    const labelRaw = cell(values, `F${row}`)
    const amountRaw = cell(values, `G${row}`)
    if (isTotalFooterString(labelRaw) || isTotalFooterString(amountRaw)) continue
    if (isBlank(labelRaw)) continue
    const label = String(labelRaw).trim()
    const amountEUR = readNumber(values, `G${row}`, issues)
    out.push({ log: 'gear', date: null, fields: { label, amountEUR } })
  }
  return out
}

/**
 * Badminton gear (INR) block, real layout (correction #6, live-run
 * 2026-07-26): L = item label, N = amountINR, no dates. M is an OPTIONAL
 * numeric quantity — captured as field `qty` only when M is a plain
 * number; any other M value (string, blank) is ignored silently (no
 * issue, no field). Row 50 is the header.
 */
function parseGearINRBlock(values: (string | number | null)[][], issues: ParserIssue[]): LogEntry[] {
  const out: LogEntry[] = []
  for (let row = 51; row <= 62; row++) {
    const labelRaw = cell(values, `L${row}`)
    if (isBlank(labelRaw)) continue
    const label = String(labelRaw).trim()
    const amountINR = readNumber(values, `N${row}`, issues)
    const qtyRaw = cell(values, `M${row}`)
    const fields: LogEntry['fields'] = { label, amountINR }
    if (typeof qtyRaw === 'number') fields.qty = qtyRaw
    out.push({ log: 'gear', date: null, fields })
  }
  return out
}

/** Footer label rows for the gym log (correction #7, live-run 2026-07-26):
 * H73 "TOTAL" / H74 "AVG € PER DAY" on the live sheet — any string H cell
 * matching /total|avg/i is a footer, silently skipped (never reaches
 * resolveLogRow, so it can't be mistaken for a bad-date). Any OTHER
 * unparseable H string still falls through to resolveLogRow -> readDate,
 * i.e. it still becomes a 'bad-date' issue, unchanged. */
const isGymFooterLabel = (v: unknown): v is string => typeof v === 'string' && /total|avg/i.test(v)

/** Gym log block, full bounding box H48:J74: H date, I amount, data rows
 * 49-74 (row 48 is the header). */
function parseGymBlock(values: (string | number | null)[][], issues: ParserIssue[]): LogEntry[] {
  const out: LogEntry[] = []
  for (let row = 49; row <= 74; row++) {
    const hRaw = cell(values, `H${row}`)
    if (isGymFooterLabel(hRaw)) continue
    const r = resolveLogRow(values, issues, `H${row}`, `I${row}`)
    if (!r.include) continue
    out.push({ log: 'gym', date: r.date, fields: { amountEUR: r.amount } })
  }
  return out
}

/**
 * Petrol log block, real layout (correction #8, live-run 2026-07-26): row
 * 81 is the title, row 82 is the header row (DATE/LITRE/AMOUNT/PER LITRE
 * at G82:J82) — neither is read. F is a running index, ignored entirely.
 * Data rows 83-152: G date, H litres, I amount (anchor), J per-litre, K
 * km (often blank). G153 is a "Total" footer — matched by string content
 * and skipped before any date-parsing is attempted (so it never becomes a
 * bad-date issue).
 */
function parsePetrolBlock(values: (string | number | null)[][], issues: ParserIssue[]): LogEntry[] {
  const out: LogEntry[] = []
  for (let row = 83; row <= 153; row++) {
    const dateRaw = cell(values, `G${row}`)
    if (typeof dateRaw === 'string' && /total/i.test(dateRaw)) continue // footer row, silent skip
    const r = resolveLogRow(values, issues, `G${row}`, `I${row}`)
    if (!r.include) continue
    const litres = readNumber(values, `H${row}`, issues)
    const perLitre = readNumber(values, `J${row}`, issues)
    const km = readNumber(values, `K${row}`, issues)
    out.push({ log: 'petrol', date: r.date, fields: { litres, amountEUR: r.amount, perLitre, km } })
  }
  return out
}

/**
 * Alcohol log block, real layout (correction #9, live-run 2026-07-26): row
 * 126 is the header (B "Item", C "Amount") — skipped, data starts row
 * 127. A is a pre-numbered running index (ignored entirely, not a
 * signal). B = label, C = amountEUR, no dates. Row inclusion is keyed off
 * B (the label cell) — pure-scaffold rows (A filled, B/C blank) are
 * skipped silently.
 */
function parseAlcoholBlock(values: (string | number | null)[][], issues: ParserIssue[]): LogEntry[] {
  const out: LogEntry[] = []
  for (let row = 127; row <= 161; row++) {
    const labelRaw = cell(values, `B${row}`)
    if (isBlank(labelRaw)) continue
    if (isTotalFooterString(labelRaw)) continue
    const label = String(labelRaw).trim()
    const amountEUR = readNumber(values, `C${row}`, issues)
    out.push({ log: 'alcohol', date: null, fields: { label, amountEUR } })
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
  const shintoSbiLifeINR = parseShintoSbiLife(values, issues)
  const sandraSbiLife = parseSandraSbiBlock(values, issues)
  const gearEUR = parseGearEURBlock(values, issues)
  const gearINR = parseGearINRBlock(values, issues)
  const gym = parseGymBlock(values, issues)
  const petrol = parsePetrolBlock(values, issues)
  const alcohol = parseAlcoholBlock(values, issues)
  const upstocks = parseUpstocksBlock(values, issues)

  return {
    budget, budgetTotals, loan, savingsSnapshots, projection, sbiLife,
    shintoSbiLifeINR, sandraSbiLife,
    logs: [...gearEUR, ...gearINR, ...gym, ...petrol, ...alcohol],
    upstocks, issues,
  }
}
