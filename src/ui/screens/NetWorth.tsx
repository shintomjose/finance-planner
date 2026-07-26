// Net worth screen (Plan 2 Task 11): aggregates bank/DB/MF/Binance/Upstocks
// into one view via ../../lib/networth, then renders totals, composition,
// per-source P/L, and an editable 2035-style compounding projection. All
// the math lives in ../../lib/networth — this component only shapes chart
// data, tracks the two projection inputs (local state, no persistence),
// and decides per-source whether to show real figures or an EmptyState.
// Task 14 wired mutualFunds/deutscheBank/binance into App.tsx (via
// useAppData), so these props are populated whenever their special tab
// fetched and parsed successfully — the EmptyState path now means "this
// source's tab failed to fetch/parse" (see Parser Health), not "not
// connected yet".
import { useMemo, useState } from 'react'
import { round1, round2 } from '../../lib/mathUtils'
import { buildNetWorth, project } from '../../lib/networth'
import { pickDisplayedMonth } from '../../lib/period'
import type { NetWorthSource } from '../../lib/networth'
import type { DeutscheBankData } from '../../parse/deutscheBank'
import type { MonthlyPlanData } from '../../parse/monthlyPlan'
import type { MutualFundsData } from '../../parse/mutualFunds'
import type { BinanceData } from '../../parse/binance'
import type { MonthData } from '../../types'
import { CategoryLine } from '../charts/CategoryLine'
import { Donut } from '../charts/Donut'
import { EmptyState, Money, Section, StatCard } from '../shared'

export interface NetWorthScreenProps {
  months: MonthData[]
  plan: MonthlyPlanData | null
  mutualFunds: MutualFundsData | null
  deutscheBank: DeutscheBankData | null
  binance: BinanceData | null
  fxRate: number
  now: Date
}

const eurFmt = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
const fmtEUR = (v: number) => (Number.isFinite(v) ? eurFmt.format(v) : eurFmt.format(0))
const fmtPct = (v: number | null) => (v == null ? '–' : `${v > 0 ? '+' : ''}${Math.round(v * 10) / 10}%`)

// Sources that carry an INR figure underneath — everything else (bank, db,
// binance) is already a straight EUR read, so showing a re-derived ₹ number
// for those would just be noise (dataviz: never show a secondary channel
// the reader can't independently ground).
const INR_SOURCES = new Set<NetWorthSource['source']>(['mf', 'upstocks'])

const DEFAULT_PROJECTION_YEARS = 10

export function NetWorth({ months, plan, mutualFunds, deutscheBank, binance, fxRate, now }: NetWorthScreenProps) {
  const latestMonth = useMemo(() => pickDisplayedMonth(months, now), [months, now])
  const view = useMemo(
    () => buildNetWorth(latestMonth, plan, mutualFunds, deutscheBank, binance, fxRate),
    [latestMonth, plan, mutualFunds, deutscheBank, binance, fxRate],
  )

  const [rate, setRate] = useState(() => plan?.projection.ratePct ?? 5)
  const [contribution, setContribution] = useState(() => plan?.projection.yearlyContribution ?? 0)

  const connected: Record<NetWorthSource['source'], boolean> = {
    bank: months.length > 0,
    db: deutscheBank != null,
    mf: mutualFunds != null,
    binance: binance != null,
    upstocks: plan != null,
  }

  const nothingConnected = !connected.bank && !connected.db && !connected.mf && !connected.binance && !connected.upstocks

  if (nothingConnected) {
    return (
      <EmptyState
        title="Net worth"
        message="No net-worth sources connected yet — bank, Deutsche Bank, Mutual Funds, Binance, and Upstocks will appear here once they're wired up."
      />
    )
  }

  const compositionSlices = view.sources
    .filter((s) => s.valueEUR != null && s.valueEUR !== 0)
    .map((s) => ({ key: s.source, label: s.label, value: s.valueEUR as number }))

  const netPl = view.investedTotalEUR !== 0 ? round1((view.totalEUR - view.investedTotalEUR) / view.investedTotalEUR * 100) : null

  const originalRows = (plan?.projection.rows ?? []).filter(
    (r): r is { year: number; valueEUR: number } => r.year != null && r.valueEUR != null,
  )
  const projectionYears = originalRows.length > 0 ? originalRows.length : DEFAULT_PROJECTION_YEARS
  const recomputed = project(view.totalEUR, rate, contribution, projectionYears)
  const baseYear = now.getFullYear()
  const projectionData = recomputed.map((p, i) => ({
    year: originalRows[i]?.year ?? baseYear + p.year,
    original: originalRows[i]?.valueEUR ?? null,
    recomputed: p.valueEUR,
  }))

  return (
    <div className="networth-screen">
      <Section title="Net worth">
        <div className="stat-grid">
          <StatCard label="Total" value={<Money amountEUR={view.totalEUR} tabular />} />
          <StatCard label="Invested" value={<Money amountEUR={view.investedTotalEUR} tabular />} />
          <StatCard
            label="P/L vs. invested"
            value={
              netPl == null ? (
                <Money amountEUR={null} tabular />
              ) : (
                <Money amountEUR={round2(view.totalEUR - view.investedTotalEUR)} tabular />
              )
            }
            sub={netPl != null ? `${netPl > 0 ? '+' : ''}${netPl}%` : undefined}
            tone={netPl == null ? 'neutral' : view.totalEUR - view.investedTotalEUR >= 0 ? 'good' : 'bad'}
          />
        </div>
      </Section>

      <Section title="Composition">
        {compositionSlices.length === 0 ? (
          <EmptyState message="No source has a known value yet." />
        ) : (
          <Donut data={compositionSlices} valueFormatter={fmtEUR} centerLabel={fmtEUR(view.totalEUR)} />
        )}
      </Section>

      <Section title="Sources">
        <div className="networth-rows">
          {view.sources.map((s) =>
            connected[s.source] ? (
              <div className="networth-row" key={s.source}>
                <span className="networth-row-label">{s.label}</span>
                <div className="networth-row-figures">
                  <Money amountEUR={s.valueEUR} fxRate={INR_SOURCES.has(s.source) ? fxRate : undefined} tabular />
                  {s.investedEUR != null && (
                    <span className="networth-row-invested">
                      Invested <span className="num">{fmtEUR(s.investedEUR)}</span>
                    </span>
                  )}
                </div>
                <span className="networth-row-pl num" data-tone={s.plEUR == null ? 'neutral' : s.plEUR >= 0 ? 'good' : 'bad'}>
                  {s.plEUR == null ? '—' : `${s.plEUR > 0 ? '+' : ''}${fmtEUR(s.plEUR)}`}
                  {s.plPct != null && <span className="networth-row-pl-pct"> ({fmtPct(s.plPct)})</span>}
                </span>
              </div>
            ) : (
              <div className="networth-row" key={s.source}>
                <span className="networth-row-label">{s.label}</span>
                <span className="networth-row-disconnected">Not connected yet</span>
              </div>
            ),
          )}
        </div>
      </Section>

      <Section
        title="Projection"
        actions={
          <div className="networth-projection-controls">
            <label className="networth-input-group">
              Rate %
              <input
                type="number"
                step="0.1"
                value={rate}
                onChange={(e) => setRate(Number(e.target.value))}
                className="networth-input"
              />
            </label>
            <label className="networth-input-group">
              Yearly contribution
              <input
                type="number"
                step="100"
                value={contribution}
                onChange={(e) => setContribution(Number(e.target.value))}
                className="networth-input"
              />
            </label>
          </div>
        }
      >
        <CategoryLine
          data={projectionData}
          xKey="year"
          series={[
            { key: 'original', label: 'Sheet projection' },
            { key: 'recomputed', label: 'Recomputed' },
          ]}
          valueFormatter={fmtEUR}
        />
      </Section>
    </div>
  )
}
