// MUTUAL FUNDS special-tab parser (workbook-map.md §2.2, plan2-task-4-brief).
// Ten fund column-groups laid out side by side across A1:X45, one funded-row
// grid shared by all of them. Column A (rows 2-38) carries a pre-numbered
// "running number" scaffold value on EVERY data row regardless of whether
// any fund actually has an entry that row — it is NEVER read as a signal by
// this parser (each group's own date/amount/value cells decide inclusion),
// which is what makes pure-scaffold rows (A filled, every group blank) skip
// silently while rows where A is ALSO filled alongside real fund data still
// produce snapshots normally (self-review: scaffold detection can't swallow
// real rows because there IS no scaffold detection — it's per-group presence
// only).
//
// Column-group table (fixture-design decision — workbook-map.md §2.2 gives
// only the bounding letter ranges per group, not intra-group roles):
//   Quant Small Cap Fund            B date / C amount / D current value  (SIP 2000/mo)
//   JM Flexicap Fund                E date / F amount / G current value (SIP 5000/mo)
//   PGIM India Midcap Opp. Fund     H date / I amount / J current value (SIP 3000/mo)
//   360 ONE Focused Equity Fund     K date / L value                    (lump/valuation)
//   SBI PSU Fund                    M date / N value  — SOLD
//   Aditya Birla Sun Life Flexi Cap O date / P value                    (lump 100000)
//   SBI PSU Fund - Series 2         Q date / R value  — SOLD
//   HDFC Small Cap Fund             S date / T value
//   Motilal Oswal Midcap Fund       U date / V value
//   Invesco India Midcap Fund       W date / X value                    (lump 215000)
// Data rows 2-37 (verified live 2026-07-26 — row 38 is a per-fund TOTAL row,
// not data; see LAST_DATA_ROW below). A row counts for a group only if that
// group's own date, amount, or value cell is non-blank — column A is
// irrelevant to this test.
// Summary M39:N42: N39 invested, N40 current, N41 pct change.
import type { InvestmentSnapshot, ParserIssue } from '../types'
import type { SpecialGrids } from '../data/specialTabs'
import { cellAt, isBlank, readDateAt, readNumberAt } from './cells'

const SHEET = 'MUTUAL FUNDS'
const FIRST_DATA_ROW = 2
// Live-run correction #10 (2026-07-26): row 38 is a per-fund TOTAL row on the
// real sheet (B38 "TOTAL", sum amounts in each group's value column), not a
// 37th scaffold row — the old bound of 38 would have misread those sums as a
// real snapshot per fund group. Data stops at row 37; row 38 is never read
// by the per-group loop (the aggregate is already captured separately by the
// M39:N42 summary block below).
const LAST_DATA_ROW = 37

export interface FundTotal {
  fund: string
  investedINR: number | null
}

export interface MutualFundsData {
  snapshots: InvestmentSnapshot[]
  summary: { investedINR: number | null; currentINR: number | null; pctChange: number | null }
  /** Per-fund row-38 invested totals (owner 2026-07-31: "SUM of C38, F38,
   * I38, K38, O38, S38, U38, W38" — the two SOLD funds excluded), with the
   * fund heading read from row 1. ₹. */
  fundTotals: FundTotal[]
  /** Σ fundTotals (nulls contribute nothing); null when every cell missing. */
  investedTotalINR: number | null
  issues: ParserIssue[]
}

function readNumber(values: (string | number | null)[][], ref: string, issues: ParserIssue[]): number | null {
  return readNumberAt(values, ref, SHEET, issues)
}

function readDate(values: (string | number | null)[][], ref: string, issues: ParserIssue[]): string | null {
  return readDateAt(values, ref, SHEET, issues)
}

interface FundGroup {
  asset: string
  dateCol: string
  amountCol?: string
  valueCol: string
  sold?: true
}

const FUND_GROUPS: FundGroup[] = [
  { asset: 'Quant Small Cap Fund', dateCol: 'B', amountCol: 'C', valueCol: 'D' },
  { asset: 'JM Flexicap Fund', dateCol: 'E', amountCol: 'F', valueCol: 'G' },
  { asset: 'PGIM India Midcap Opportunities Fund', dateCol: 'H', amountCol: 'I', valueCol: 'J' },
  { asset: '360 ONE Focused Equity Fund', dateCol: 'K', valueCol: 'L' },
  { asset: 'SBI PSU Fund', dateCol: 'M', valueCol: 'N', sold: true },
  { asset: 'Aditya Birla Sun Life Flexi Cap Fund', dateCol: 'O', valueCol: 'P' },
  { asset: 'SBI PSU Fund - Series 2', dateCol: 'Q', valueCol: 'R', sold: true },
  { asset: 'HDFC Small Cap Fund', dateCol: 'S', valueCol: 'T' },
  { asset: 'Motilal Oswal Midcap Fund', dateCol: 'U', valueCol: 'V' },
  { asset: 'Invesco India Midcap Fund', dateCol: 'W', valueCol: 'X' },
]

/** Parses one fund group's data rows (FIRST_DATA_ROW..LAST_DATA_ROW). A row
 * is included only when the group's own date, amount, or value cell holds a
 * real (non-blank) value — a row that is blank across all three of this
 * group's cells is not a snapshot, whether or not column A's scaffold
 * running-number is present for that row. */
function parseFundGroup(
  values: (string | number | null)[][], issues: ParserIssue[], group: FundGroup
): InvestmentSnapshot[] {
  const out: InvestmentSnapshot[] = []
  for (let row = FIRST_DATA_ROW; row <= LAST_DATA_ROW; row++) {
    const dateRef = `${group.dateCol}${row}`
    const valueRef = `${group.valueCol}${row}`
    const amountRef = group.amountCol ? `${group.amountCol}${row}` : null

    const dateRaw = cellAt(values, dateRef)
    const valueRaw = cellAt(values, valueRef)
    const amountRaw = amountRef ? cellAt(values, amountRef) : null
    const hasData = !isBlank(dateRaw) || !isBlank(valueRaw) || (amountRaw !== null && !isBlank(amountRaw))
    if (!hasData) continue

    const date = readDate(values, dateRef, issues)
    const valueINR = readNumber(values, valueRef, issues)
    const snapshot: InvestmentSnapshot = {
      date, source: 'mf', asset: group.asset, valueINR: valueINR ?? undefined,
    }
    if (amountRef) {
      const investedINR = readNumber(values, amountRef, issues)
      snapshot.investedINR = investedINR ?? undefined
    }
    if (group.sold) snapshot.sold = true
    out.push(snapshot)
  }
  return out
}

const TOTAL_ROW = 38

/** One column letter to the right (A..W input — the grid ends at X). */
const nextCol = (col: string): string => String.fromCharCode(col.charCodeAt(0) + 1)

/** Per-fund invested totals off the row-38 TOTAL row (owner 2026-07-31),
 * SOLD groups excluded. The owner's cells are the group's amount column
 * for the three SIP groups (C/F/I) and the group's FIRST column for the
 * lump groups (K/O/S/U/W); on grids where that first cell carries the
 * "TOTAL" label instead of the figure (the synthetic fixture does), the
 * cell one to the right is used. A non-numeric pair yields null silently —
 * the label strings living in this row are expected, not bad data. Heading
 * comes from the group's row-1 title cell, falling back to the canonical
 * asset name. */
function parseFundTotals(values: (string | number | null)[][]): { fundTotals: FundTotal[]; investedTotalINR: number | null } {
  const fundTotals: FundTotal[] = []
  for (const group of FUND_GROUPS) {
    if (group.sold) continue
    const headingRaw = cellAt(values, `${group.dateCol}1`)
    const fund = typeof headingRaw === 'string' && !isBlank(headingRaw) ? headingRaw.trim() : group.asset
    const primaryCol = group.amountCol ?? group.dateCol
    const candidates = [cellAt(values, `${primaryCol}${TOTAL_ROW}`), cellAt(values, `${nextCol(primaryCol)}${TOTAL_ROW}`)]
    const investedINR = candidates.find((v): v is number => typeof v === 'number') ?? null
    fundTotals.push({ fund, investedINR })
  }
  const known = fundTotals.filter((f) => f.investedINR != null)
  const investedTotalINR = known.length ? known.reduce((s, f) => s + (f.investedINR ?? 0), 0) : null
  return { fundTotals, investedTotalINR }
}

/** Summary block M39:N42: N39 invested, N40 current, N41 pct change. */
function parseSummary(values: (string | number | null)[][], issues: ParserIssue[]): MutualFundsData['summary'] {
  return {
    investedINR: readNumber(values, 'N39', issues),
    currentINR: readNumber(values, 'N40', issues),
    pctChange: readNumber(values, 'N41', issues),
  }
}

/**
 * Parses the MUTUAL FUNDS special tab (workbook-map.md §2.2). Never throws:
 * every unparseable-but-present cell routes to `issues` instead. Pre-numbered
 * scaffold rows (column A running number with no fund data) are skipped
 * without an issue, per parser rules.
 */
export function parseMutualFunds(grids: SpecialGrids): MutualFundsData {
  const { values } = grids
  const issues: ParserIssue[] = []

  const snapshots = FUND_GROUPS.flatMap((group) => parseFundGroup(values, issues, group))
  const summary = parseSummary(values, issues)
  const { fundTotals, investedTotalINR } = parseFundTotals(values)

  return { snapshots, summary, fundTotals, investedTotalINR, issues }
}
