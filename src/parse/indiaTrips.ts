// INDIA_2023 special-tab parser (workbook-map.md §2.6, plan2-task-6-brief).
// Trips are located by a WHOLE-GRID text scan, never fixed rows — the map's
// listed header cells (B1, E33/I33, E114/I114, E252/I252) are fixture
// reference only; the live sheet grows a new block per trip.
//
// Discriminator: a cell qualifies as a trip header when (a) its string value
// matches HEADER_PATTERN — either the literal keyword "trip", or a
// month-name immediately adjacent to a 20xx year (bare `20\d\d` alone is
// NOT enough: reviewer demonstrated a plain ledger line like
// `['Flight 2023', 'Total', 5000]` false-positives under a bare-year
// pattern) — AND (b) the matched string does NOT itself parse as a
// delimited date (rules out a stray "01-12-2023"-shaped cell that happens
// to embed a year) AND (c) the cell immediately to its right is a string
// containing "total" (case-insensitive) AND the cell two to its right is
// numeric. All three conditions are required.
//
// Second layer of defense: once a header is accepted, its whole block's row
// range (header row through the last row used by either ledger) is marked
// "claimed" and the scan never even looks at cells inside a claimed range
// for further header candidates — so an ordinary ledger row that happens to
// pass the text/total-adjacency check (e.g. a coincidental subtotal line
// sitting a few rows below a real header) can't fabricate a second, nested
// trip out of already-claimed data.
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
import { cellAt, isBlank, parseDelimitedDate, readDateAt, readNumberAt } from './cells'

const SHEET = 'INDIA_2023'
// "trip" literal, OR a month-name run immediately followed by a 20xx year
// (matches the real sheet's trip names like "Dec 2023"/"Apr 2024") — never
// a bare `20\d\d` on its own, which is what let an ordinary ledger line
// like "Flight 2023" masquerade as a header.
const HEADER_PATTERN = /trip|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s*20\d\d/i
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

/** Tests whether `cell` qualifies as a trip header purely on its own text —
 * the pattern match plus the not-a-date guard. Total-adjacency (the other
 * half of the discriminator) is checked by the caller, which already has
 * the neighboring cells in hand. */
function looksLikeHeader(cell: unknown): cell is string {
  if (typeof cell !== 'string' || !HEADER_PATTERN.test(cell)) return false
  // A cell that itself parses as a delimited date (e.g. "01-12-2023") is a
  // date value, not a trip name, even though it embeds a 20xx year.
  if (parseDelimitedDate(cell) !== null) return false
  return true
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

  const iciciRef = `${indexToCol(hc + 3)}${hr}`
  const iciciRaw = cellAt(values, iciciRef)
  const iciciSplitINR = isBlank(iciciRaw) ? null : readNumber(values, iciciRef, issues)

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
 *
 * Single top-to-bottom pass with a claimed-range guard: once a header is
 * accepted, every row from the header down through the last row consumed by
 * either of its ledgers is marked claimed, and the scan skips straight past
 * those rows — so nothing inside an already-claimed block can be
 * mis-detected as a second, nested trip header (see discriminator doc
 * comment above).
 */
export function parseIndiaTrips(grids: SpecialGrids): { trips: Trip[]; issues: ParserIssue[] } {
  const { values } = grids
  const issues: ParserIssue[] = []
  const trips: Trip[] = []

  let claimedThroughRow = 0 // 1-based; rows <= this are already inside an accepted trip's block
  for (let r = 0; r < values.length; r++) {
    const row1 = r + 1
    if (row1 <= claimedThroughRow) continue
    const line = values[r]
    if (!line) continue

    for (let c = 0; c < line.length; c++) {
      const cell = line[c]
      if (!looksLikeHeader(cell)) continue
      const totalLabel = line[c + 1]
      const totalAmount = line[c + 2]
      if (typeof totalLabel !== 'string' || !TOTAL_LABEL_PATTERN.test(totalLabel)) continue
      if (typeof totalAmount !== 'number') continue

      const trip = buildTrip(values, issues, { row: row1, col: c, name: cell.trim() })
      trips.push(trip)

      const entryRows = [...trip.entriesINR, ...trip.entriesEUR].map((e) => e.row)
      claimedThroughRow = Math.max(row1, ...entryRows)
      break // one header per row is enough; the claimed-range skip handles the rest
    }
  }

  return { trips, issues }
}
