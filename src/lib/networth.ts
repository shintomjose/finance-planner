// Net worth aggregation (Plan 2 Task 11): pulls the latest snapshot from
// each already-parsed source — bank (month ledgers), DEUTSCHE BANK,
// MUTUAL FUNDS, BINANCE, and MONTHLY_PLAN's UPSTOCS block — into one
// consistent NetWorthView. Pure/no I/O: every value here is a straight
// read (or unit conversion) of data other parsers already produced.
import type { DeutscheBankData } from '../parse/deutscheBank'
import type { MonthlyPlanData } from '../parse/monthlyPlan'
import type { MutualFundsData } from '../parse/mutualFunds'
import type { BinanceData } from '../parse/binance'
import type { MonthData } from '../types'
import { round2 } from './mathUtils'

export interface NetWorthSource {
  source: 'bank' | 'db' | 'mf' | 'binance' | 'upstocks' | 'sbi-sandra' | 'sbi'
  label: string
  valueEUR: number | null
  investedEUR: number | null
  plEUR: number | null
  plPct: number | null
  /** Owner 2026-07-31: Binance and Upstocks are shown on the Net worth tab
   * but NEVER counted — excluded from totalEUR/investedTotalEUR/
   * nonBankTotalEUR, the composition donut, and the Overview tile. */
  displayOnly?: true
}

export interface NetWorthView {
  sources: NetWorthSource[]
  totalEUR: number
  investedTotalEUR: number
  /** Σ valueEUR of every source EXCEPT 'bank' — what the Overview NET
   * WORTH tile adds on top of cash (bank is already its cash term; using
   * totalEUR there would double-count it). Owner rework 2026-07-31: most
   * sources now carry their figure as value with no invested basis, so
   * investedTotalEUR no longer represents the holdings. */
  nonBankTotalEUR: number
}

export interface ProjectionPoint {
  year: number
  valueEUR: number
}

/** ₹ → € using `fxRate` (₹ per €). Guarded against a non-positive or
 * non-finite rate (division would otherwise yield Infinity/NaN/a negative
 * "value") — returns null rather than a nonsensical figure, same as a
 * genuinely missing INR input. */
function inrToEur(valueINR: number | null | undefined, fxRate: number): number | null {
  if (valueINR == null) return null
  if (!Number.isFinite(fxRate) || fxRate <= 0) return null
  return round2(valueINR / fxRate)
}

/** P/L is only meaningful when both sides of the comparison are known —
 * one null input (no invested basis, or no current value) yields null/null
 * rather than treating the missing side as zero. `plPct` additionally
 * guards divide-by-zero when investedEUR is exactly 0. */
function plOf(valueEUR: number | null, investedEUR: number | null): { plEUR: number | null; plPct: number | null } {
  if (valueEUR == null || investedEUR == null) return { plEUR: null, plPct: null }
  const plEUR = round2(valueEUR - investedEUR)
  const plPct = investedEUR !== 0 ? round2((plEUR / investedEUR) * 100) : null
  return { plEUR, plPct }
}

function buildBankSource(latestMonth: MonthData | undefined): NetWorthSource {
  return { source: 'bank', label: 'Bank', valueEUR: latestMonth?.bankTotal ?? null, investedEUR: null, plEUR: null, plPct: null }
}

/** Owner rework 2026-07-31: the Deutsche Bank row is the PAID figure — the
 * G91 grand total of the payment matrix (db.grandTotalEUR) — not the
 * sporadic col-I portfolio valuation it used before. No invested/P/L pair:
 * paid-in is the one figure the owner tracks here. */
function buildDbSource(db: DeutscheBankData | null): NetWorthSource {
  const label = 'Deutsche Bank (paid)'
  if (!db) return { source: 'db', label, valueEUR: null, investedEUR: null, plEUR: null, plPct: null }
  return { source: 'db', label, valueEUR: db.grandTotalEUR, investedEUR: null, plEUR: null, plPct: null }
}

/** Owner rework 2026-07-31: the Mutual Funds row is the SUM of the per-fund
 * row-38 invested totals (mf.investedTotalINR — C38/F38/I38/K38/O38/S38/
 * U38/W38, SOLD funds excluded), converted at fxRate. The N39/N40 summary
 * pair (and its P/L) is no longer this row's figure. */
function buildMfSource(mf: MutualFundsData | null, fxRate: number): NetWorthSource {
  const label = 'India Mutual Funds'
  if (!mf) return { source: 'mf', label, valueEUR: null, investedEUR: null, plEUR: null, plPct: null }
  return { source: 'mf', label, valueEUR: inrToEur(mf.investedTotalINR, fxRate), investedEUR: null, plEUR: null, plPct: null }
}

/** SBI Life rows (owner 2026-07-31, correction #3), both ₹ → € at fxRate:
 * - Sandra SBI Life: the SANDRA block's own TOTAL (falling back to the sum
 *   of its dated rows when the footer is missing).
 * - Shinto SBI Life: MONTHLY_PLAN C61. G8 (the combined family total) is
 *   deliberately NOT a source — it includes Sandra and would double-count. */
function buildSbiSources(plan: MonthlyPlanData | null, fxRate: number): NetWorthSource[] {
  const none = { valueEUR: null, investedEUR: null, plEUR: null, plPct: null }
  if (!plan) {
    return [
      { source: 'sbi-sandra', label: 'Sandra SBI Life', ...none },
      { source: 'sbi', label: 'Shinto SBI Life', ...none },
    ]
  }
  const sandra = plan.sandraSbiLife
  const sandraRowsSum = sandra.rows.some((r) => r.amountINR != null)
    ? sandra.rows.reduce((s, r) => s + (r.amountINR ?? 0), 0)
    : null
  const sandraINR = sandra.totalINR ?? sandraRowsSum
  return [
    { source: 'sbi-sandra', label: 'Sandra SBI Life', valueEUR: inrToEur(sandraINR, fxRate), investedEUR: null, plEUR: null, plPct: null },
    { source: 'sbi', label: 'Shinto SBI Life', valueEUR: inrToEur(plan.shintoSbiLifeINR, fxRate), investedEUR: null, plEUR: null, plPct: null },
  ]
}

function buildBinanceSource(binance: BinanceData | null): NetWorthSource {
  const label = 'Binance'
  if (!binance) return { source: 'binance', label, valueEUR: null, investedEUR: null, plEUR: null, plPct: null, displayOnly: true }
  const valueEUR = binance.currentEUR
  const investedEUR = binance.netInEUR
  const { plEUR, plPct } = plOf(valueEUR, investedEUR)
  return { source: 'binance', label, valueEUR, investedEUR, plEUR, plPct, displayOnly: true }
}

/**
 * UPSTOCS (MONTHLY_PLAN, A97:C123) only carries a date/asset/value(INR) per
 * row — `parseUpstocksBlock` never populates `InvestmentSnapshot.investedINR`
 * because the sheet has no per-row "amount invested" column for this block
 * (workbook-map.md §2.1). So while this reads `investedINR` generically (in
 * case a future parser revision starts populating it), today it is always
 * undefined → investedEUR/plEUR/plPct come out null here, documented rather
 * than guessed at (e.g. by treating valueEUR as cost basis, which would be
 * wrong). "Latest" = the last snapshot in the array, i.e. the last data row
 * in sheet order — the same convention parseBinance already uses for its
 * own "latest" snapshot.
 */
function buildUpstocksSource(plan: MonthlyPlanData | null, fxRate: number): NetWorthSource {
  const label = 'Upstocks'
  const snapshots = plan?.upstocks ?? []
  const latest = snapshots[snapshots.length - 1]
  if (!latest) return { source: 'upstocks', label, valueEUR: null, investedEUR: null, plEUR: null, plPct: null, displayOnly: true }
  const valueEUR = inrToEur(latest.valueINR, fxRate)
  const investedEUR = inrToEur(latest.investedINR, fxRate)
  const { plEUR, plPct } = plOf(valueEUR, investedEUR)
  return { source: 'upstocks', label, valueEUR, investedEUR, plEUR, plPct, displayOnly: true }
}

/**
 * Aggregates every net-worth source into one view. Each source is built
 * independently and always produces a row (never omitted) — a missing
 * input (undefined month, null parser data) yields an all-null row rather
 * than shrinking `sources`, so the screen can render a stable list and
 * decide per-row how to present "not connected yet".
 */
export function buildNetWorth(
  latestMonth: MonthData | undefined,
  plan: MonthlyPlanData | null,
  mf: MutualFundsData | null,
  db: DeutscheBankData | null,
  binance: BinanceData | null,
  fxRate: number,
): NetWorthView {
  const sources: NetWorthSource[] = [
    buildBankSource(latestMonth),
    buildDbSource(db),
    buildMfSource(mf, fxRate),
    buildBinanceSource(binance),
    buildUpstocksSource(plan, fxRate),
    ...buildSbiSources(plan, fxRate),
  ]
  const counted = sources.filter((s) => !s.displayOnly)
  const totalEUR = round2(counted.reduce((sum, s) => sum + (s.valueEUR ?? 0), 0))
  const investedTotalEUR = round2(counted.reduce((sum, s) => sum + (s.investedEUR ?? 0), 0))
  const nonBankTotalEUR = round2(counted.filter((s) => s.source !== 'bank').reduce((sum, s) => sum + (s.valueEUR ?? 0), 0))
  return { sources, totalEUR, investedTotalEUR, nonBankTotalEUR }
}

/**
 * Compounds `startEUR` forward `years` annual periods at `ratePct`, adding
 * `yearlyContribution` at the END of each period after that period's growth
 * is applied: `v = v * (1 + rate / 100) + contribution`. This is an
 * ordinary-annuity shape (grow, then contribute) — confirmed against
 * MONTHLY_PLAN's own K11:R26 projection fixture (rate 7.5%, yearly
 * contribution 6000, starting 21000): the sheet's first three steps are
 * 21000 → 28575 → 36718 → 45472, which this formula reproduces exactly
 * (21000*1.075+6000=28575, 28575*1.075+6000=36718.125≈36718, …). An
 * earlier annuity-due draft (contribute-then-grow) diverges from the sheet
 * by ~5% by year 12 — reviewer finding. `point.year` is a 1-indexed offset
 * from `startEUR` (1 = one compounding period out), not a calendar year —
 * a caller that wants calendar years (e.g. the screen, using `now`) maps
 * offsets onto them separately.
 */
export function project(startEUR: number, ratePct: number, yearlyContribution: number, years: number): ProjectionPoint[] {
  const points: ProjectionPoint[] = []
  let v = startEUR
  for (let year = 1; year <= years; year++) {
    v = v * (1 + ratePct / 100) + yearlyContribution
    points.push({ year, valueEUR: round2(v) })
  }
  return points
}
