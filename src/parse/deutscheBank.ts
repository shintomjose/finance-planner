// DEUTSCHE BANK special-tab parser (workbook-map.md §2.3, plan2-task-5-brief).
// Two blocks on one tab: a 5-row product table (A2:C10) and a payment matrix
// (E2:N90, row 91 is a totals/cross-check footer, NOT a payment row).
//
// Matrix column layout — fixture-design decision, workbook-map.md gives only
// the bounding range E2:N91 plus three facts (G91 grand total, sporadic
// valuations in col I, per-product sums on row 91), not the intra-matrix
// column roles:
//   E  payment # (n)
//   F  payment date
//   G  UNUSED on data rows — reserved for the row-91 grand total only
//   H  RiesterRente Shinto payment      (products[0], perProduct[0])
//   I  sporadic portfolio VALUATION (source 'db') — independent of the
//      payment columns; most rows blank, occasional rows carry a snapshot
//      dated by that row's F cell. This is why I sits between the H and J
//      product columns instead of being grouped with them: it is never one
//      of the 5 "per-product" columns.
//   J  BasisRente payment                (products[1], perProduct[1])
//   K  RiesterRente Sandra payment        (products[2], perProduct[2])
//   L  Badenia Bausparen payment          (products[3], perProduct[3])
//   M  DWS Fonds payment                  (products[4], perProduct[4])
//   N  unused / reserved
// perProduct arrays are always index-aligned with `products[]` (self-review
// requirement from the task brief) — both are built from the same
// PRODUCT_COLUMNS table below, in the same order, so there is exactly one
// place that could ever desync them.
//
// Row 91 (totals footer): G91 grand total (read directly, no cross-check),
// H91/J91/K91/L91/M91 = the sheet's own per-product sums, cross-checked
// against a recompute over the 68 real payment rows (nulled/ref-error cells
// contribute 0, matching how a SUM() formula would treat them). A drift of
// more than 0.01 between sheet and recompute becomes a 'sum-drift' issue
// anchored at the row-91 cell for that product.
//
// Scaffold rows 70-90 (beyond the 68 real payments, still inside the E2:N90
// bound) are fully blank and skipped silently, same "pre-numbered/blank
// scaffold isn't data" rule as MUTUAL FUNDS (workbook-map.md common
// mistakes table) — except here the scaffold rows aren't even pre-numbered,
// they're just blank, so the plain hasData check already handles them.
import type { InvestmentSnapshot, ParserIssue } from '../types'
import type { SpecialGrids } from '../data/specialTabs'
import { cellAt, isBlank, readDateAt, readNumberAt } from './cells'

const SHEET = 'DEUTSCHE BANK'

const PRODUCT_ROWS = [2, 3, 4, 5, 6] // A2:C6 — 5 real products; A7:C10 left blank (not in fixture)
const FIRST_PAYMENT_ROW = 2
const LAST_PAYMENT_ROW = 90 // row 91 is the totals footer, handled separately
const TOTALS_ROW = 91

interface ProductColumn { name: string; col: string }
const PRODUCT_COLUMNS: ProductColumn[] = [
  { name: 'RiesterRente Shinto', col: 'H' },
  { name: 'BasisRente', col: 'J' },
  { name: 'RiesterRente Sandra', col: 'K' },
  { name: 'Badenia Bausparen', col: 'L' },
  { name: 'DWS Fonds', col: 'M' },
]

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
 * silently, same as every other label-driven block in this codebase. */
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

/** Payment matrix + sporadic valuations, rows 2-90, walked in a single pass
 * so each row's F (date) cell is read at most once — a row can be BOTH a
 * real payment row (E/date/product cells populated) AND a valuation row
 * (col I populated) simultaneously, and both would otherwise call
 * readDateAt on the same F cell independently, double-emitting any
 * bad-date/ref-error issue for that one cell. Resolving the date once and
 * reusing it for whichever of the two entries applies avoids that.
 *
 * A row counts as a real payment when its #, date, or any of the 5 product
 * cells holds a value — this excludes the fully blank scaffold rows beyond
 * the 68th real payment without needing to know "68" as a magic cutoff.
 * Column I is never itself a payment-row signal (see file header) — a row
 * with only a valuation and nothing else produces a valuation snapshot but
 * no payments[] entry. */
function parseMatrix(
  values: (string | number | null)[][], issues: ParserIssue[]
): { payments: DeutscheBankData['payments']; valuations: InvestmentSnapshot[] } {
  const payments: DeutscheBankData['payments'] = []
  const valuations: InvestmentSnapshot[] = []

  for (let row = FIRST_PAYMENT_ROW; row <= LAST_PAYMENT_ROW; row++) {
    const nRaw = cellAt(values, `E${row}`)
    const dateRaw = cellAt(values, `F${row}`)
    const valuationRaw = cellAt(values, `I${row}`)
    const productRaws = PRODUCT_COLUMNS.map((p) => cellAt(values, `${p.col}${row}`))
    const isPaymentRow = !isBlank(nRaw) || !isBlank(dateRaw) || productRaws.some((v) => !isBlank(v))
    const isValuationRow = !isBlank(valuationRaw)
    if (!isPaymentRow && !isValuationRow) continue

    const date = (isPaymentRow || isValuationRow) ? readDate(values, `F${row}`, issues) : null

    if (isPaymentRow) {
      const n = isBlank(nRaw) ? null : readNumber(values, `E${row}`, issues)
      const perProduct = PRODUCT_COLUMNS.map((p) => readNumber(values, `${p.col}${row}`, issues))
      payments.push({ n, date, perProduct })
    }
    if (isValuationRow) {
      const valueEUR = readNumber(values, `I${row}`, issues)
      valuations.push({ date, source: 'db', asset: SHEET, valueEUR: valueEUR ?? undefined })
    }
  }
  return { payments, valuations }
}

/** Per-product sums (row 91) cross-checked against a recompute over the
 * already-parsed `payments` (nulled/ref-error cells contribute 0, same as a
 * live SUM() formula would once the error propagates out). A |diff| > 0.01
 * becomes a 'sum-drift' issue anchored at that product's row-91 cell. */
function parseProductSums(
  values: (string | number | null)[][], issues: ParserIssue[], payments: DeutscheBankData['payments']
): DeutscheBankData['productSums'] {
  return PRODUCT_COLUMNS.map((p, i) => {
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
 * logic below.
 */
export function parseDeutscheBank(grids: SpecialGrids): DeutscheBankData {
  const { values } = grids
  const issues: ParserIssue[] = []

  const products = parseProducts(values, issues)
  const { payments, valuations } = parseMatrix(values, issues)
  const grandTotalEUR = readNumber(values, `G${TOTALS_ROW}`, issues)
  const productSums = parseProductSums(values, issues, payments)

  return { products, payments, grandTotalEUR, valuations, productSums, issues }
}
