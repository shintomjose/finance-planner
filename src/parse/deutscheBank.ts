// DEUTSCHE BANK special-tab parser (workbook-map.md §2.3, plan2-task-5-brief;
// remapped 2026-07-26 against the real live sheet — see
// .superpowers/sdd/live-run-fixes-report.md for the full corrections list).
// Two blocks on one tab: a 5-row product table (A2:C10) and a payment matrix
// (E2:N91).
//
// Matrix layout, verified live 2026-07-26 (live-run correction #11) — row 2
// is a HEADER row (not data), which the old fixture-design layout had
// mistaken for payment #1:
//   E  "No"            — payment # (n)
//   F  "Date"           — payment date
//   G  (blank header)   — unused / reserved, never read
//   H  "Equities Invested"
//   I  "Equities Total"  — sporadic portfolio VALUATION (source 'db'),
//      independent of the payment columns; most rows blank, occasional rows
//      carry a snapshot dated by that row's F cell. Kept exactly as before
//      this correction — see live-run correction #12 — I is hardcoded, never
//      part of the dynamic product-column scan below.
//   J  "Profit"
//   K  "RiesterRente - Shinto"
//   L  "Resiterrente - Sandra" (sic — real header typo, tolerated by the
//      fuzzy matcher below)
//   M  "BasisRente - Shinto"
//   N  ... (further product headers)
//
// Only 4 of the 5 known pension products (from A2:C10) have a dedicated flat
// payment column in this matrix (RiesterRente Shinto, RiesterRente Sandra,
// BasisRente, Badenia Bausparen) — DWS Fonds isn't one of the "K..N" named
// columns and has no column here at all. H ("Equities Invested") and J
// ("Profit") don't fuzzy-match any of the 5 known product names either — per
// the "never silently drop" rule, they're still discovered and carried as
// their own product-like columns (canonical name = the header text itself),
// rather than being dropped or crammed into a wrong bucket. Both
// `payments[].perProduct` and `productSums` are built from the SAME dynamic
// column discovery below (`discoverProductColumns`), in the same order, so
// there is exactly one place that could ever desync them.
//
// Row 91 (totals footer): G91 grand total (read directly, no cross-check);
// each discovered product column's own row-91 sum is cross-checked against a
// recompute over the payment rows (nulled/ref-error cells contribute 0,
// matching how a SUM() formula would treat them). A drift of more than 0.01
// becomes a 'sum-drift' issue anchored at the row-91 cell for that column.
//
// Data rows 3-90 (row 2 is now the header). Scaffold rows beyond the real
// payments, still inside the E3:N90 bound, are fully blank and skipped
// silently, same "pre-numbered/blank scaffold isn't data" rule as MUTUAL
// FUNDS (workbook-map.md common mistakes table) — except here the scaffold
// rows aren't even pre-numbered, they're just blank, so the plain hasData
// check already handles them.
import type { InvestmentSnapshot, ParserIssue } from '../types'
import type { SpecialGrids } from '../data/specialTabs'
import { cellAt, isBlank, readDateAt, readNumberAt } from './cells'

const SHEET = 'DEUTSCHE BANK'

const PRODUCT_ROWS = [2, 3, 4, 5, 6] // A2:C6 — 5 real products; A7:C10 left blank (not in fixture)
const HEADER_ROW = 2 // live-run correction #11: row 2 is the matrix header, not a payment row
const FIRST_PAYMENT_ROW = 3
const LAST_PAYMENT_ROW = 90 // row 91 is the totals footer, handled separately
const TOTALS_ROW = 91

// Columns G..N are scanned for a header at row 2; E (index)/F (date)/I
// (hardcoded valuation, correction #12) are excluded from the scan.
const PRODUCT_SCAN_COLS = ['G', 'H', 'J', 'K', 'L', 'M', 'N']

interface ProductColumn { name: string; col: string }

/** Normalizes header text for fuzzy matching: lowercase, strip everything
 * but a-z. Tolerates punctuation/spacing/suffix noise ("RiesterRente -
 * Shinto" -> "riesterrenteshinto") and the real sheet's "Resiterrente"
 * typo (handled by matching on the `riesterrente`/`resiterrente`
 * alternation below, not on normalize alone). */
const normalize = (s: string): string => s.toLowerCase().replace(/[^a-z]/g, '')

const KNOWN_PRODUCTS: { canonical: string; test: (norm: string) => boolean }[] = [
  { canonical: 'RiesterRente Shinto', test: (n) => (n.includes('riesterrente') || n.includes('resiterrente')) && n.includes('shinto') },
  { canonical: 'RiesterRente Sandra', test: (n) => (n.includes('riesterrente') || n.includes('resiterrente')) && n.includes('sandra') },
  { canonical: 'BasisRente', test: (n) => n.includes('basisrente') },
  { canonical: 'Badenia Bausparen', test: (n) => n.includes('badenia') || n.includes('bausparen') },
  { canonical: 'DWS Fonds', test: (n) => n.includes('dws') && n.includes('fonds') },
]

/** Scans the row-2 header across PRODUCT_SCAN_COLS and builds the dynamic
 * product-column list (live-run correction #11): a non-blank header string
 * is matched against the 5 known canonical product names (fuzzy,
 * typo-tolerant); no match -> the raw trimmed header text becomes the
 * column's name instead of being dropped. A blank header (e.g. col G on
 * the live sheet) simply isn't a candidate. */
function discoverProductColumns(values: (string | number | null)[][]): ProductColumn[] {
  const out: ProductColumn[] = []
  for (const col of PRODUCT_SCAN_COLS) {
    const raw = cellAt(values, `${col}${HEADER_ROW}`)
    if (typeof raw !== 'string' || isBlank(raw)) continue
    const norm = normalize(raw)
    const known = KNOWN_PRODUCTS.find((p) => p.test(norm))
    out.push({ name: known ? known.canonical : raw.trim(), col })
  }
  return out
}

export interface DeutscheBankData {
  products: { name: string; monthlyEUR: number | null }[]
  payments: { n: number | null; date: string | null; perProduct: (number | null)[] }[]
  grandTotalEUR: number | null
  valuations: InvestmentSnapshot[]
  productSums: { name: string; sheetSum: number | null; computedSum: number | null }[]
  issues: ParserIssue[]
}

function readNumber(values: (string | number | null)[][], ref: string, issues: ParserIssue[]): number | null {
  return readNumberAt(values, ref, SHEET, issues)
}

function readDate(values: (string | number | null)[][], ref: string, issues: ParserIssue[]): string | null {
  return readDateAt(values, ref, SHEET, issues)
}

/** Products A2:C10: name in A, monthly EUR in C (B is unused — no data
 * modeled there per the map). A row counts only when A holds a real label;
 * A7:A10 are blank in the live sheet's tail of that range and are skipped
 * silently, same as every other label-driven block in this codebase.
 * Unaffected by the live-run correction — this block's layout is unchanged. */
function parseProducts(values: (string | number | null)[][], issues: ParserIssue[]): DeutscheBankData['products'] {
  const out: DeutscheBankData['products'] = []
  for (const row of PRODUCT_ROWS) {
    const nameRaw = cellAt(values, `A${row}`)
    if (isBlank(nameRaw)) continue
    const name = String(nameRaw).trim()
    const monthlyEUR = readNumber(values, `C${row}`, issues)
    out.push({ name, monthlyEUR })
  }
  return out
}

/** Payment matrix + sporadic valuations, rows FIRST_PAYMENT_ROW-90, walked in
 * a single pass so each row's F (date) cell is read at most once — a row can
 * be BOTH a real payment row (E and/or a product cell populated) AND a
 * valuation row (col I populated) simultaneously, and both would otherwise
 * call readDateAt on the same F cell independently, double-emitting any
 * bad-date/ref-error issue for that one cell. Resolving the date once and
 * reusing it for whichever of the two entries applies avoids that.
 *
 * A row counts as a real payment when its # or any of the discovered
 * product cells holds a value — this excludes the fully blank scaffold rows
 * beyond the last real payment without needing to know its row number as a
 * magic cutoff. Deliberately NOT keyed off the F (date) cell: F is shared
 * with the valuation side of this row (see below), so a valuation-only row
 * — E and every product cell blank, only F (its own date) and I populated —
 * must NOT be misread as a payment row. Column I is never itself a
 * payment-row signal — a row with only a valuation and nothing else
 * produces a valuation snapshot but no payments[] entry. */
function parseMatrix(
  values: (string | number | null)[][], issues: ParserIssue[], productColumns: ProductColumn[]
): { payments: DeutscheBankData['payments']; valuations: InvestmentSnapshot[] } {
  const payments: DeutscheBankData['payments'] = []
  const valuations: InvestmentSnapshot[] = []

  for (let row = FIRST_PAYMENT_ROW; row <= LAST_PAYMENT_ROW; row++) {
    const nRaw = cellAt(values, `E${row}`)
    const valuationRaw = cellAt(values, `I${row}`)
    const productRaws = productColumns.map((p) => cellAt(values, `${p.col}${row}`))
    const isPaymentRow = !isBlank(nRaw) || productRaws.some((v) => !isBlank(v))
    const isValuationRow = !isBlank(valuationRaw)
    if (!isPaymentRow && !isValuationRow) continue

    // At least one of isPaymentRow/isValuationRow is true here (the `continue`
    // above already filtered out rows where both are false).
    const date = readDate(values, `F${row}`, issues)

    if (isPaymentRow) {
      const n = isBlank(nRaw) ? null : readNumber(values, `E${row}`, issues)
      const perProduct = productColumns.map((p) => readNumber(values, `${p.col}${row}`, issues))
      payments.push({ n, date, perProduct })
    }
    if (isValuationRow) {
      const valueEUR = readNumber(values, `I${row}`, issues)
      valuations.push({ date, source: 'db', asset: SHEET, valueEUR: valueEUR ?? undefined })
    }
  }
  return { payments, valuations }
}

/** Per-product sums (row 91), one per DYNAMICALLY discovered product column
 * (live-run correction #11 — "row 91 sums compared per MAPPED column"),
 * cross-checked against a recompute over the already-parsed `payments`
 * (nulled/ref-error cells contribute 0, same as a live SUM() formula would
 * once the error propagates out). A |diff| > 0.01 becomes a 'sum-drift'
 * issue anchored at that column's row-91 cell. */
function parseProductSums(
  values: (string | number | null)[][], issues: ParserIssue[],
  payments: DeutscheBankData['payments'], productColumns: ProductColumn[]
): DeutscheBankData['productSums'] {
  return productColumns.map((p, i) => {
    const cell = `${p.col}${TOTALS_ROW}`
    const sheetSum = readNumber(values, cell, issues)
    const computedSum = payments.reduce((acc, pay) => acc + (pay.perProduct[i] ?? 0), 0)
    if (sheetSum !== null && Math.abs(sheetSum - computedSum) > 0.01) {
      issues.push({
        sheet: SHEET, cell, kind: 'sum-drift',
        detail: `"${p.name}" sheet sum ${sheetSum} at ${cell} vs recomputed ${computedSum} (diff ${(sheetSum - computedSum).toFixed(2)})`,
      })
    }
    return { name: p.name, sheetSum, computedSum }
  })
}

/**
 * Parses the DEUTSCHE BANK special tab (workbook-map.md §2.3). Never throws:
 * every unparseable-but-present cell routes to `issues` instead. Row 91 is
 * never treated as a payment row even though several of its cells are
 * non-blank — it is read exclusively by the grand-total and product-sums
 * logic below. Product columns are discovered dynamically from the row-2
 * header (live-run correction #11) rather than hardcoded.
 */
export function parseDeutscheBank(grids: SpecialGrids): DeutscheBankData {
  const { values } = grids
  const issues: ParserIssue[] = []

  const products = parseProducts(values, issues)
  const productColumns = discoverProductColumns(values)
  const { payments, valuations } = parseMatrix(values, issues, productColumns)
  const grandTotalEUR = readNumber(values, `G${TOTALS_ROW}`, issues)
  const productSums = parseProductSums(values, issues, payments, productColumns)

  return { products, payments, grandTotalEUR, valuations, productSums, issues }
}
