// SACHIN special-tab parser (workbook-map.md §2.5, plan2-task-6-brief).
// Four independent blocks share one 340x10 grid:
//   - Given ledger        B2:C336  (label B, amount C; date A optional, only
//                                    appears from ~row 122 — readDateAt already
//                                    returns null-without-issue on a blank
//                                    cell, so no special-casing is needed to
//                                    satisfy "date optional before row 122,
//                                    no issue")
//   - Totals               G131 (given), G132 (remaining) — read as sheet
//                                    values purely for the drift check below;
//                                    PersonLedger.totals itself is always the
//                                    RECOMPUTED figures (same "app recomputes,
//                                    never trusts the sheet formula" contract
//                                    as month.ts's carryover chain, §1.3).
//   - Repayments            F133:G189 (fixture-design decision: F=date,
//                                    G=amount; the map gives only the
//                                    2-column bounding range, no label
//                                    column exists, so every repayment entry
//                                    gets a fixed `label: 'Repayment'`)
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

/** Repayments F133:G189: row counts when G (amount) holds a real value
 * (including a bad/error cell, which still counts as "present" — same
 * "unparseable-but-present is never silently dropped" contract as every
 * other parser). No label column exists in this block, so every entry gets
 * a fixed label (fixture-design decision, documented above). */
function parseRepayments(values: (string | number | null)[][], issues: ParserIssue[]): PersonLedger['repayments'] {
  const out: PersonLedger['repayments'] = []
  for (let row = REPAY_FIRST_ROW; row <= REPAY_LAST_ROW; row++) {
    const amountRaw = cellAt(values, `G${row}`)
    if (isBlank(amountRaw)) continue
    const date = readDate(values, `F${row}`, issues)
    const amountEUR = readNumber(values, `G${row}`, issues)
    out.push({ date, label: 'Repayment', amountEUR, row })
  }
  return out
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
  const repayments = parseRepayments(values, issues)
  const emis = parseEmis(values, issues)

  const given = entries.reduce((sum, e) => sum + (e.amountEUR ?? 0), 0)
  const repaid = repayments.reduce((sum, r) => sum + (r.amountEUR ?? 0), 0)
  const remaining = given - repaid

  const sheetGiven = readNumber(values, `G${GIVEN_TOTAL_ROW}`, issues)
  if (sheetGiven !== null && Math.abs(sheetGiven - given) > 0.01) {
    issues.push({
      sheet: SHEET, cell: `G${GIVEN_TOTAL_ROW}`, kind: 'sum-drift',
      detail: `given total: sheet ${sheetGiven} at G${GIVEN_TOTAL_ROW} vs recomputed ${given} (diff ${(sheetGiven - given).toFixed(2)})`,
    })
  }

  const sheetRemaining = readNumber(values, `G${REMAINING_ROW}`, issues)
  if (sheetRemaining !== null && Math.abs(sheetRemaining - remaining) > 0.01) {
    issues.push({
      sheet: SHEET, cell: `G${REMAINING_ROW}`, kind: 'sum-drift',
      detail: `remaining: sheet ${sheetRemaining} at G${REMAINING_ROW} vs recomputed ${remaining} (diff ${(sheetRemaining - remaining).toFixed(2)})`,
    })
  }

  const ledger: PersonLedger = {
    name: 'Sachin',
    entries, repayments, emis,
    totals: { given, repaid, remaining },
  }

  return { ledger, issues }
}
