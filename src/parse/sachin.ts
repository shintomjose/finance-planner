// SACHIN special-tab parser (workbook-map.md §2.5, plan2-task-6-brief).
// Four independent blocks share one 340x10 grid:
//   - Given ledger        B2:C336  (label B, amount C; date A optional, only
//                                    appears from ~row 122 — readDateAt already
//                                    returns null-without-issue on a blank
//                                    cell, so no special-casing is needed to
//                                    satisfy "date optional before row 122,
//                                    no issue")
//   - Totals               G131 (given) is drift-checked against the
//                                    recomputed `given` — same "app
//                                    recomputes, never trusts the sheet
//                                    formula" contract as month.ts's
//                                    carryover chain (§1.3). G132 (remaining)
//                                    is the ONE deliberate exception to that
//                                    contract (live-run correction #15,
//                                    2026-07-26): the sheet's own G132
//                                    formula cross-references
//                                    INDIA_2023!I19, data this parser has no
//                                    access to, so a naive given-minus-repaid
//                                    recompute against it produces a large,
//                                    meaningless "drift". `remaining` is
//                                    read directly from G132 instead (falling
//                                    back to the given-repaid recompute only
//                                    if G132 itself is unreadable), and no
//                                    sum-drift issue is ever emitted for it.
//                                    A second drift check, of the same shape
//                                    as G131's, runs against G190 — the
//                                    sheet's own repayments-total cell,
//                                    immediately below the F133:G189 range,
//                                    matching the data+footer-total pattern
//                                    every other block in this codebase uses
//                                    (SBI, petrol, alcohol, mutual funds,
//                                    deutsche bank). NOTE: no explicit cell
//                                    reference for a "repayments total" was
//                                    given in the live-run brief — G190 is an
//                                    inference from that pattern, flagged as
//                                    unverified in the live-run-fixes report.
//   - Repayments            F133:G189, real layout (live-run correction #14,
//                                    2026-07-26): F=LABEL (no dates in this
//                                    block at all), G=amountEUR. `date` is
//                                    always null; `label` falls back to the
//                                    fixed string 'Repayment' only on the
//                                    (should-never-happen) case where F
//                                    itself is blank on an amount-bearing row.
//   - EMI trackers          H/I/J, located by scanning col H for one of the
//                                    four known header labels (never by the
//                                    map's fixed rows) — each block's
//                                    installment rows run H+1, H+2, ... with
//                                    amount in I, until I is blank. J is an
//                                    optional free-text note (fixture-design
//                                    decision: J is never a date for EMI
//                                    rows — EMI installments don't carry a
//                                    date in this parser, only a note).
import type { ParserIssue, PersonLedger } from '../types'
import type { SpecialGrids } from '../data/specialTabs'
import { cellAt, isBlank, readDateAt, readNumberAt } from './cells'

const SHEET = 'SACHIN'

const GIVEN_FIRST_ROW = 2
const GIVEN_LAST_ROW = 336
const GIVEN_TOTAL_ROW = 131
const REMAINING_ROW = 132
const REPAY_FIRST_ROW = 133
const REPAY_LAST_ROW = 189
const REPAY_TOTAL_ROW = 190 // inferred footer row — see header comment above
const EMI_SCAN_LAST_ROW = 340

const EMI_NAMES = ['iPhone-13', 'iPhone 14', 'Fridge', 'Washing Machine']

export interface SachinData {
  ledger: PersonLedger
  issues: ParserIssue[]
}

function readNumber(values: (string | number | null)[][], ref: string, issues: ParserIssue[]): number | null {
  return readNumberAt(values, ref, SHEET, issues)
}

function readDate(values: (string | number | null)[][], ref: string, issues: ParserIssue[]): string | null {
  return readDateAt(values, ref, SHEET, issues)
}

/** Given ledger B2:C336: row counts when B (label) holds a real value —
 * label-driven inclusion, same convention as every other block-scan parser
 * in this codebase. Date (col A) is read unconditionally; before ~row 122
 * it's blank on every row, which readDateAt already turns into `null` with
 * no issue, so the "date optional, no issue" requirement falls out for free. */
function parseGiven(values: (string | number | null)[][], issues: ParserIssue[]): PersonLedger['entries'] {
  const out: PersonLedger['entries'] = []
  for (let row = GIVEN_FIRST_ROW; row <= GIVEN_LAST_ROW; row++) {
    const labelRaw = cellAt(values, `B${row}`)
    if (isBlank(labelRaw)) continue
    const label = String(labelRaw).trim()
    const date = readDate(values, `A${row}`, issues)
    const amountEUR = readNumber(values, `C${row}`, issues)
    out.push({ date, label, amountEUR, row })
  }
  return out
}

/** Repayments F133:G189, real layout (live-run correction #14, 2026-07-26):
 * F is a LABEL, not a date — this block has no dates at all, `date` is
 * always null. Row counts when G (amount) holds a real value (including a
 * bad/error cell, which still counts as "present" — same
 * "unparseable-but-present is never silently dropped" contract as every
 * other parser). `label` falls back to 'Repayment' only if F is itself
 * blank on an amount-bearing row.
 *
 * Inline footer total (owner correction 2026-07-31): the sheet's own
 * repayments-total cell lives INSIDE this range on the live sheet (the
 * G190 footer position was an unverified inference) — it was being parsed
 * as a REDACTED € "repayment" row and double-counted. A parsed row is
 * reclassified as that footer when its F label contains "total"
 * (case-insensitive), or — labels can be blank on the live footer — when
 * it is the LAST amount-bearing row and its amount equals the sum of every
 * other row (±0.01, ≥2 rows so a lone entry can never match itself against
 * an empty rest). The footer is excluded from the ledger and returned
 * separately for the drift check. */
function parseRepayments(
  values: (string | number | null)[][],
  issues: ParserIssue[],
): { rows: PersonLedger['repayments']; inlineTotal: { row: number; amountEUR: number | null } | null } {
  const out: PersonLedger['repayments'] = []
  for (let row = REPAY_FIRST_ROW; row <= REPAY_LAST_ROW; row++) {
    const amountRaw = cellAt(values, `G${row}`)
    if (isBlank(amountRaw)) continue
    const labelRaw = cellAt(values, `F${row}`)
    const label = isBlank(labelRaw) ? 'Repayment' : String(labelRaw).trim()
    const amountEUR = readNumber(values, `G${row}`, issues)
    out.push({ date: null, label, amountEUR, row })
  }

  const totalIdx = out.findIndex((r) => /total/i.test(r.label))
  if (totalIdx >= 0) {
    const [footer] = out.splice(totalIdx, 1)
    return { rows: out, inlineTotal: { row: footer.row, amountEUR: footer.amountEUR } }
  }

  const last = out[out.length - 1]
  if (out.length >= 2 && last.amountEUR != null) {
    const restSum = out.slice(0, -1).reduce((s, r) => s + (r.amountEUR ?? 0), 0)
    if (Math.abs(last.amountEUR - restSum) <= 0.01) {
      out.pop()
      return { rows: out, inlineTotal: { row: last.row, amountEUR: last.amountEUR } }
    }
  }

  return { rows: out, inlineTotal: null }
}

/** EMI blocks: scan the whole H column for one of the 4 known header
 * labels (case-insensitive, trimmed) — never the map's fixed rows, which
 * are fixture-reference only (workbook-map.md §2.5). For each header found,
 * walk rows below reading I (amount) until I is blank; J (optional note)
 * rides along as `label`, defaulting to '' when absent. */
function parseEmis(values: (string | number | null)[][], issues: ParserIssue[]): PersonLedger['emis'] {
  const knownLower = new Map(EMI_NAMES.map((n) => [n.toLowerCase(), n]))
  const out: PersonLedger['emis'] = []

  for (let row = 1; row <= EMI_SCAN_LAST_ROW; row++) {
    const headerRaw = cellAt(values, `H${row}`)
    if (typeof headerRaw !== 'string') continue
    const canonical = knownLower.get(headerRaw.trim().toLowerCase())
    if (!canonical) continue

    const rows: PersonLedger['emis'][number]['rows'] = []
    for (let r = row + 1; r <= EMI_SCAN_LAST_ROW; r++) {
      const amountRaw = cellAt(values, `I${r}`)
      if (isBlank(amountRaw)) break
      const amountEUR = readNumber(values, `I${r}`, issues)
      const noteRaw = cellAt(values, `J${r}`)
      const label = isBlank(noteRaw) ? '' : String(noteRaw).trim()
      rows.push({ date: null, label, amountEUR, row: r })
    }
    out.push({ name: canonical, rows })
  }
  return out
}

/**
 * Parses the SACHIN special tab (workbook-map.md §2.5). Never throws: every
 * unparseable-but-present cell routes to `issues` instead. `ledger.totals`
 * always holds the app's own recomputed sums — the sheet's G131/G132 values
 * are read only to drift-check against those recomputes, same "app
 * recomputes, never trusts the formula" contract used elsewhere (month.ts
 * carryover chain).
 */
export function parseSachin(grids: SpecialGrids): SachinData {
  const { values } = grids
  const issues: ParserIssue[] = []

  const entries = parseGiven(values, issues)
  const { rows: repayments, inlineTotal } = parseRepayments(values, issues)
  const emis = parseEmis(values, issues)

  const given = entries.reduce((sum, e) => sum + (e.amountEUR ?? 0), 0)
  const repaid = repayments.reduce((sum, r) => sum + (r.amountEUR ?? 0), 0)

  const sheetGiven = readNumber(values, `G${GIVEN_TOTAL_ROW}`, issues)
  if (sheetGiven !== null && Math.abs(sheetGiven - given) > 0.01) {
    issues.push({
      sheet: SHEET, cell: `G${GIVEN_TOTAL_ROW}`, kind: 'sum-drift',
      detail: `given total: sheet ${sheetGiven} at G${GIVEN_TOTAL_ROW} vs recomputed ${given} (diff ${(sheetGiven - given).toFixed(2)})`,
    })
  }

  // The sheet's repayments-total cell: the inline footer inside the block
  // when detected (owner correction 2026-07-31 — it was double-counted as
  // a row), else the G190 position inferred from the data+footer pattern.
  const repaidTotalCell = inlineTotal ? `G${inlineTotal.row}` : `G${REPAY_TOTAL_ROW}`
  const sheetRepaidTotal = inlineTotal ? inlineTotal.amountEUR : readNumber(values, `G${REPAY_TOTAL_ROW}`, issues)
  if (sheetRepaidTotal !== null && Math.abs(sheetRepaidTotal - repaid) > 0.01) {
    issues.push({
      sheet: SHEET, cell: repaidTotalCell, kind: 'sum-drift',
      detail: `repayments total: sheet ${sheetRepaidTotal} at ${repaidTotalCell} vs recomputed ${repaid} (diff ${(sheetRepaidTotal - repaid).toFixed(2)})`,
    })
  }

  // Live-run correction #15 (2026-07-26): G132's own sheet formula
  // cross-references INDIA_2023!I19 — data this parser never fetches — so
  // comparing it against a naive given-minus-repaid recompute produces a
  // large, meaningless "drift". Trust the sheet's figure directly instead
  // (no drift issue is ever emitted for it); fall back to the recompute
  // only if G132 itself is unreadable.
  const sheetRemaining = readNumber(values, `G${REMAINING_ROW}`, issues)
  const remaining = sheetRemaining ?? (given - repaid)

  const ledger: PersonLedger = {
    name: 'Sachin',
    entries, repayments, emis,
    totals: { given, repaid, remaining },
  }

  return { ledger, issues }
}
