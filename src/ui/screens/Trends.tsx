// Trends screen (Plan 2 Task 10): monthly income/expense, per-category
// trend lines, year-over-year same-month deltas, top movers vs. their
// trailing average, household vs. rest split, and carryover drift. All the
// math lives in ../../lib/trends (+ ../../lib/carryover for drift) — this
// component only shapes chart data and renders it. recharts (via MonthBar/
// CategoryLine/Sparkline) is fine here since Trends is its own lazy chunk,
// same as Budget's PacingBar chunk stays recharts-free.
import { useMemo, useState } from 'react'
import { computeChain } from '../../lib/carryover'
import { MIN_MOVER_DELTA_EUR, categorySeries, householdSplit, monthlyTotals, topMovers, yoySameMonth } from '../../lib/trends'
import type { AppState } from '../../state/appState'
import type { MonthData } from '../../types'
import { CategoryLine } from '../charts/CategoryLine'
import { MonthBar } from '../charts/MonthBar'
import { Sparkline } from '../charts/Sparkline'
import { EmptyState, Section } from '../shared'

export interface TrendsScreenProps {
  months: MonthData[]
  state: AppState
  now: Date
}

type Range = '12' | '24' | 'all'
const RANGES: Range[] = ['12', '24', 'all']

const eurFmt = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
const fmtEUR = (v: number) => (Number.isFinite(v) ? eurFmt.format(v) : eurFmt.format(0))
const fmtPct = (v: number | null) => (v == null ? '–' : `${v > 0 ? '+' : ''}${Math.round(v)}%`)

function labelFor(category: string): string {
  return category === 'other' ? 'Other' : category.charAt(0).toUpperCase() + category.slice(1)
}

function sliceRange<T>(items: T[], range: Range): T[] {
  if (range === 'all') return items
  return items.slice(-Number(range))
}

export function Trends({ months, state, now }: TrendsScreenProps) {
  const [range, setRange] = useState<Range>('24')

  const totals = useMemo(() => monthlyTotals(months), [months])
  const series = useMemo(() => categorySeries(months, state.categoryOverrides, 6), [months, state.categoryOverrides])
  const yoy = useMemo(() => yoySameMonth(months, now), [months, now])
  const movers = useMemo(() => topMovers(months, state.categoryOverrides, 3), [months, state.categoryOverrides])
  const household = useMemo(() => householdSplit(months), [months])
  const drift = useMemo(() => computeChain(months), [months])

  if (months.length < 2) {
    return (
      <EmptyState
        title="Trends"
        message="Trends need at least two months of data to compare — check back once more months are loaded."
      />
    )
  }

  // The 12/24/all toggle is screen-level (reviewer finding): it windows every
  // month-indexed section (net, category lines, household split) by the same
  // tab set, sliced from `totals` (chronologically sorted) AFTER the sort so
  // "last 12" always means the 12 most recent months, never input order. YoY
  // (its own year window), top movers (its own trailing window), and
  // carryover drift (the full chain, for auditability) intentionally stay
  // range-independent.
  const rangedTotals = sliceRange(totals, range)
  const rangedTabs = new Set(rangedTotals.map((p) => p.tab))
  const netData = rangedTotals.map((p) => ({ tab: p.tab, income: p.income, expense: p.expense }))

  const rangedSeries = series.map((s) => ({ ...s, points: s.points.filter((p) => rangedTabs.has(p.tab)) }))
  const categoryTabs = rangedSeries[0]?.points.map((p) => p.tab) ?? []
  const categoryData = categoryTabs.map((tab, i) => {
    const row: Record<string, unknown> = { tab }
    for (const s of rangedSeries) row[s.category] = s.points[i]?.value ?? 0
    return row
  })
  const categorySeriesDefs = rangedSeries.map((s) => ({ key: s.category, label: labelFor(s.category) }))

  const yoyData = yoy.map((d) => ({ month: d.monthName, previous: d.previous ?? 0, current: d.current ?? 0 }))
  const householdData = household
    .filter((h) => rangedTabs.has(h.tab))
    .map((h) => ({ tab: h.tab, household: h.household, other: h.other }))
  const driftSpark = drift.map((d) => d.driftEUR ?? 0)

  return (
    <div className="trends-screen">
      <Section
        title="Monthly net"
        actions={
          <div className="range-toggle" role="group" aria-label="Range">
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                className="range-toggle-btn"
                data-active={range === r}
                onClick={() => setRange(r)}
              >
                {r === 'all' ? 'All' : `${r}m`}
              </button>
            ))}
          </div>
        }
      >
        <MonthBar
          data={netData}
          xKey="tab"
          series={[
            { key: 'income', label: 'Income' },
            { key: 'expense', label: 'Expense' },
          ]}
          valueFormatter={fmtEUR}
        />
      </Section>

      <Section title="Spend by category">
        {categorySeriesDefs.length === 0 ? (
          <EmptyState message="No categorized expenses yet." />
        ) : (
          <CategoryLine data={categoryData} xKey="tab" series={categorySeriesDefs} valueFormatter={fmtEUR} />
        )}
      </Section>

      <Section title="Year over year (same month)">
        <MonthBar
          data={yoyData}
          xKey="month"
          series={[
            { key: 'previous', label: 'Last year' },
            { key: 'current', label: 'This year' },
          ]}
          valueFormatter={fmtEUR}
        />
      </Section>

      <Section title="Top movers">
        {movers.length === 0 ? (
          <EmptyState
            message={`No category moved by more than €${MIN_MOVER_DELTA_EUR} vs. its trailing 3-month average.`}
          />
        ) : (
          <ul className="movers-list">
            {movers.map((m) => (
              <li key={m.category} className="movers-row">
                <span className="movers-name">{labelFor(m.category)}</span>
                <span className="movers-figures">
                  <span className="movers-current">{fmtEUR(m.current)}</span>
                  <span className="movers-avg">vs {fmtEUR(m.trailingAvg)} avg</span>
                </span>
                <span className="movers-delta" data-tone={m.deltaEUR > 0 ? 'bad' : 'good'}>
                  {m.deltaEUR > 0 ? '+' : ''}
                  {fmtEUR(m.deltaEUR)} ({fmtPct(m.deltaPct)})
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Household vs. rest">
        <MonthBar
          data={householdData}
          xKey="tab"
          series={[
            { key: 'household', label: 'Household' },
            { key: 'other', label: 'Other' },
          ]}
          valueFormatter={fmtEUR}
        />
      </Section>

      <Section title="Carryover drift">
        <Sparkline data={driftSpark} tone="accent" />
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th>Computed</th>
                <th>Sheet</th>
                <th>Drift</th>
              </tr>
            </thead>
            <tbody>
              {drift.map((d) => (
                <tr key={d.tab} data-drift={d.driftEUR != null && d.driftEUR !== 0}>
                  <td>{d.tab}</td>
                  <td>{fmtEUR(d.computed)}</td>
                  <td>{d.sheet == null ? '–' : fmtEUR(d.sheet)}</td>
                  <td>{d.driftEUR == null ? '–' : fmtEUR(d.driftEUR)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  )
}
