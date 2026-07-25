// BINANCE special-tab parser (workbook-map.md §2.4, plan2-task-6-brief).
// Single flat log, header row 2, data rows 3+ until a 2-consecutive-blank-row
// streak stops the scan — unlike the other special tabs so far, this block's
// END isn't a fixed last row or a label ("Total") to search for; it's a
// run-length blank check, since the live sheet has no footer marker and the
// fetched range (BINANCE!A1:G30) is wider than the real data to leave growth
// room. Rows beyond the streak are never touched, even if they hold stray
// leftover values (silent, same "don't trust scaffold beyond the real data"
// principle as MUTUAL FUNDS/DEUTSCHE BANK, just with a different detector).
//
// Column layout (fixture-design decision — workbook-map.md §2.4 gives only
// "running total D, spot F, P/L G", not B/C's roles):
//   A  date
//   B  deposit amount
//   C  withdraw amount
//   D  running total deposited so far (net) -> InvestmentSnapshot.investedEUR
//   E  unused / reserved (never read, same pattern as DEUTSCHE BANK's N)
//   F  current spot value of the holdings at that point -> valueEUR
//   G  running P/L (F - D) — read for issue-surfacing only (a bad/#REF! cell
//      there must still be caught), not modeled in InvestmentSnapshot since
//      the type has no field for it and it's fully derivable from D/F.
// B/C (deposit/withdraw) are likewise read only so a bad cell there still
// produces a ParserIssue — BinanceData has no transaction-level output, only
// the per-row snapshot (D/F) and the final net/current totals, so B/C never
// feed a returned value, same "read for side-effect" pattern used by
// monthlyPlan.ts's parseBudgetBlock for A2:A5.
import type { InvestmentSnapshot, ParserIssue } from '../types'
import type { SpecialGrids } from '../data/specialTabs'
import { cellAt, isBlank, readDateAt, readNumberAt } from './cells'

const SHEET = 'BINANCE'
const FIRST_DATA_ROW = 3
const LAST_ROW = 30 // bound of the fetched range (BINANCE!A1:G30)
const DATA_COLS = ['A', 'B', 'C', 'D', 'F', 'G'] // E deliberately excluded — never read at all

export interface BinanceData {
  snapshots: InvestmentSnapshot[]
  netInEUR: number | null
  currentEUR: number | null
  issues: ParserIssue[]
}

function readNumber(values: (string | number | null)[][], ref: string, issues: ParserIssue[]): number | null {
  return readNumberAt(values, ref, SHEET, issues)
}

function readDate(values: (string | number | null)[][], ref: string, issues: ParserIssue[]): string | null {
  return readDateAt(values, ref, SHEET, issues)
}

/** A row is "fully blank" when none of its data columns (A,B,C,D,F,G — G is
 * still checked here even though it's issue-only for parsed data, so a
 * stray value in G alone still counts as "not blank" for the streak check). */
function isRowBlank(values: (string | number | null)[][], row: number): boolean {
  return DATA_COLS.every((col) => isBlank(cellAt(values, `${col}${row}`)))
}

/**
 * Parses the BINANCE special tab (workbook-map.md §2.4). Never throws: every
 * unparseable-but-present cell routes to `issues` instead. Scans from
 * FIRST_DATA_ROW until it hits 2 consecutive fully-blank rows, then stops —
 * anything at or beyond that point (including the tail of the fetched
 * range) is ignored silently, per the task-6 brief's "blank rows after data
 * (silent)" plant.
 */
export function parseBinance(grids: SpecialGrids): BinanceData {
  const { values } = grids
  const issues: ParserIssue[] = []
  const snapshots: InvestmentSnapshot[] = []

  let blankStreak = 0
  for (let row = FIRST_DATA_ROW; row <= LAST_ROW; row++) {
    if (isRowBlank(values, row)) {
      blankStreak++
      if (blankStreak >= 2) break
      continue
    }
    blankStreak = 0

    const date = readDate(values, `A${row}`, issues)
    readNumber(values, `B${row}`, issues) // deposit — issue side-effect only
    readNumber(values, `C${row}`, issues) // withdraw — issue side-effect only
    const investedEUR = readNumber(values, `D${row}`, issues)
    const valueEUR = readNumber(values, `F${row}`, issues)
    readNumber(values, `G${row}`, issues) // P/L — issue side-effect only

    snapshots.push({
      date, source: 'binance', asset: 'Binance',
      investedEUR: investedEUR ?? undefined,
      valueEUR: valueEUR ?? undefined,
    })
  }

  const last = snapshots[snapshots.length - 1]
  const netInEUR = last?.investedEUR ?? null
  const currentEUR = last?.valueEUR ?? null

  return { snapshots, netInEUR, currentEUR, issues }
}
