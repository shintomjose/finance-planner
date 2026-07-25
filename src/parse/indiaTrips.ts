// INDIA_2023 special-tab parser (workbook-map.md §2.6, plan2-task-6-brief).
// Trips are located by a WHOLE-GRID text scan, never fixed rows — the map's
// listed header cells (B1, E33/I33, E114/I114, E252/I252) are fixture
// reference only; the live sheet grows a new block per trip.
//
// Discriminator: a cell qualifies as a trip header when (a) its string value
// matches /trip|20\d\d/i AND (b) the cell immediately to its right is a
// string containing "total" (case-insensitive) AND the cell two to its
// right is numeric. Both conditions are required — (a) alone would also
// match stray mentions of a year in unrelated notes; requiring an
// adjacent "Total <amount>" pair is what makes a match a genuine trip
// block start rather than incidental text.
//
// Fixture-design layout (workbook-map.md gives only the 4 real headers +
// totals, not an intra-block column scheme — this parser defines one,
// expressed as OFFSETS FROM the header's own (row, col) so it works
// regardless of which column a given trip's header lands in):
//   (hr, hc)    header text
//   (hr, hc+1)  "Total <currency>" label
//   (hr, hc+2)  total amount (INR) -> Trip.totalINR
//   (hr, hc+3)  ICICI credit-card split amount, optional -> iciciSplitINR
//   rows hr+2..  ₹ ledger: hc(date) / hc+1(label) / hc+2(amount) — reuses
//                the same 3 columns as the header row's own cells, just on
//                later rows, since there's no column clash across rows.
//                Row-inclusion is label-driven (hc+1 non-blank); stops at
//                the first blank label.
//   rows hr+2..  € pre-travel ledger: hc+4(date) / hc+5(label) / hc+6(amount),
//                same blank-terminated walk, offset far enough right to
//                never collide with the ₹ ledger's 3 columns.
//
// Trip.totalINR is recomputed from the ₹ ledger and cross-checked against
// the header-adjacent sheet total; a |diff| > 0.01 becomes a 'sum-drift'
// issue anchored at the total cell. There is no equivalent check for the €
// ledger — Trip has no totalEUR field to check it against.
import type { ParserIssue, Trip } from '../types'
import type { SpecialGrids } from '../data/specialTabs'
import { cellAt, isBlank, readDateAt, readNumberAt } from './cells'

const SHEET = 'INDIA_2023'
const HEADER_PATTERN = /trip|20\d\d/i
const TOTAL_LABEL_PATTERN = /total/i
const LAST_WALK_ROW = 300 // bound of the fetched range (INDIA_2023!A1:K300)

function readNumber(values: (string | number | null)[][], ref: string, issues: ParserIssue[]): number | null {
  return readNumberAt(values, ref, SHEET, issues)
}

function readDate(values: (string | number | null)[][], ref: string, issues: ParserIssue[]): string | null {
  return readDateAt(values, ref, SHEET, issues)
}

/** 0-based column index -> A1 column letters. Inverse of cells.ts's colToIndex. */
function indexToCol(idx0: number): string {
  let s = ''
  let n = idx0 + 1
  while (n > 0) {
    const rem = (n - 1) % 26
    s = String.fromCharCode(65 + rem) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

interface HeaderCandidate { row: number; col: number; name: string }

/** Scans the whole grid, top-to-bottom then left-to-right within a row, for
 * cells matching HEADER_PATTERN with a "Total <amount>" pair immediately to
 * their right — see the discriminator doc comment above. */
function scanHeaders(values: (string | number | null)[][]): HeaderCandidate[] {
  const found: HeaderCandidate[] = []
  for (let r = 0; r < values.length; r++) {
    const line = values[r]
    if (!line) continue
    for (let c = 0; c < line.length; c++) {
      const cell = line[c]
      if (typeof cell !== 'string' || !HEADER_PATTERN.test(cell)) continue
      const totalLabel = line[c + 1]
      const totalAmount = line[c + 2]
      if (typeof totalLabel !== 'string' || !TOTAL_LABEL_PATTERN.test(totalLabel)) continue
      if (typeof totalAmount !== 'number') continue
      found.push({ row: r + 1, col: c, name: cell.trim() })
    }
  }
  return found
}

/** Walks a label-driven ledger block starting at (startRow, dateCol/labelCol/amountCol),
 * one row at a time, until the label cell is blank. */
function walkLedger(
  values: (string | number | null)[][], issues: ParserIssue[],
  startRow: number, dateCol: number, labelCol: number, amountCol: number,
): Trip['entriesINR'] {
  const out: Trip['entriesINR'] = []
  const dateLetter = indexToCol(dateCol)
  const labelLetter = indexToCol(labelCol)
  const amountLetter = indexToCol(amountCol)
  for (let row = startRow; row <= LAST_WALK_ROW; row++) {
    const labelRaw = cellAt(values, `${labelLetter}${row}`)
    if (isBlank(labelRaw)) break
    const label = String(labelRaw).trim()
    const date = readDate(values, `${dateLetter}${row}`, issues)
    const amount = readNumber(values, `${amountLetter}${row}`, issues)
    out.push({ date, label, amount, row })
  }
  return out
}

function buildTrip(values: (string | number | null)[][], issues: ParserIssue[], header: HeaderCandidate): Trip {
  const { row: hr, col: hc, name } = header
  const totalCol = indexToCol(hc + 2)
  const totalINR = readNumber(values, `${totalCol}${hr}`, issues)

  const iciciRaw = cellAt(values, `${indexToCol(hc + 3)}${hr}`)
  const iciciSplitINR = isBlank(iciciRaw) ? null : readNumber(values, `${indexToCol(hc + 3)}${hr}`, issues)

  const entriesINR = walkLedger(values, issues, hr + 2, hc, hc + 1, hc + 2)
  const entriesEUR = walkLedger(values, issues, hr + 2, hc + 4, hc + 5, hc + 6)

  const computed = entriesINR.reduce((sum, e) => sum + (e.amount ?? 0), 0)
  if (totalINR !== null && Math.abs(totalINR - computed) > 0.01) {
    issues.push({
      sheet: SHEET, cell: `${totalCol}${hr}`, kind: 'sum-drift',
      detail: `"${name}" sheet total ${totalINR} at ${totalCol}${hr} vs recomputed ${computed} (diff ${(totalINR - computed).toFixed(2)})`,
    })
  }

  return { name, totalINR, entriesINR, entriesEUR, iciciSplitINR }
}

/**
 * Parses the INDIA_2023 special tab (workbook-map.md §2.6). Never throws:
 * every unparseable-but-present cell routes to `issues` instead. Trips are
 * located dynamically by scanning the whole grid for header text next to a
 * "Total" pair — the map's listed rows are for the live sheet only and are
 * never hardcoded here.
 */
export function parseIndiaTrips(grids: SpecialGrids): { trips: Trip[]; issues: ParserIssue[] } {
  const { values } = grids
  const issues: ParserIssue[] = []

  const headers = scanHeaders(values)
  const trips = headers.map((h) => buildTrip(values, issues, h))

  return { trips, issues }
}
