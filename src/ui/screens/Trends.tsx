// Trends screen (template redesign, Task 9 rebuild — replaces the Plan 2
// Task 10 layout entirely): a net worth/cash/card-debt line chart, a
// month-by-month table, and a per-category sparkline trend table, all
// windowed to the last 12 months ending at the globally selected month —
// the SAME slice construction kpis.ts's buildKpis uses (sortByPeriod, find
// selectedMonth's index, slice the 11 months before it plus itself), so
// "the last 12 months" here always means the same 12 months the header/KPI
// row above are already showing.
//
// Every figure is recomputed via monthMetrics() (kpis.ts, exported this
// task for reuse) or categorize()/categorySeries() (normalize.ts/trends.ts)
// — never a sheet cell. Carryover never enters income (repo golden rule):
// monthMetrics().income is already overviewFigures().incomeOwn, which
// excludes it.
//
// Rows/chart points are clickable and flip the App-level selectedTab (via
// `onSelectMonth`, wired in registry.tsx/App.tsx this task) — the SAME
// global month selection the header/KPI row read, so picking a month here
// updates the whole app, not just this screen.
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { monthMetrics } from '../../lib/kpis'
import { round2, sortByPeriod } from '../../lib/mathUtils'
import { categorize } from '../../lib/normalize'
import { categorySeries } from '../../lib/trends'
import type { AppState } from '../../state/appState'
import type { MonthData } from '../../types'
import { categoryColor } from '../charts/categoryColor'
import { ChartTooltip } from '../charts/ChartTooltip'
import { getPalette } from '../charts/palette'
import { Sparkline } from '../charts/Sparkline'
import { useColorScheme } from '../charts/useColorScheme'
import { EmptyState, Money } from '../shared'

export interface TrendsScreenProps {
  months: MonthData[]
  state: AppState
  selectedMonth: MonthData
  onSelectMonth?: (tab: string) => void
}

const eurFmt = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
const fmtEUR = (v: number) => (Number.isFinite(v) ? eurFmt.format(v) : eurFmt.format(0))

const MONTH_COLS = '64px 1fr 1fr 1fr 52px 1fr 1fr 1fr 120px'
const CATEGORY_COLS = '10px 1fr 120px 92px 92px 100px'

/** Largest categorize() bucket for one month's expenses (month table's "Top
 * category" column) — 'uncategorized' is a legitimate answer, same as
 * Overview's category panel. Returns null only for a month with zero
 * expense rows. */
function topCategoryFor(m: MonthData, overrides: Record<string, string>): string | null {
  if (m.expenses.length === 0) return null
  const totals = new Map<string, number>()
  for (const tx of m.expenses) {
    const cat = categorize(tx.normLabel, overrides)
    totals.set(cat, (totals.get(cat) ?? 0) + (tx.amountEUR ?? 0))
  }
  let best: string | null = null
  let bestVal = -Infinity
  for (const [cat, val] of totals) {
    if (val > bestVal) {
      bestVal = val
      best = cat
    }
  }
  return best
}

export function Trends({ months, state, selectedMonth, onSelectMonth }: TrendsScreenProps) {
  const palette = getPalette(useColorScheme())
  const overrides = state.categoryOverrides

  if (months.length < 2) {
    return (
      <EmptyState
        title="Trends"
        message="Trends need at least two months of data to compare — check back once more months are loaded."
      />
    )
  }

  // Last 12 months ending at (not centered around, not "the sheet's latest
  // tab") the globally selected month — browsing to an older month
  // re-windows every section below, same as kpis.ts's buildKpis.
  const sorted = sortByPeriod(months)
  const selIdx = sorted.findIndex((m) => m.tab === selectedMonth.tab)
  const endIdx = selIdx >= 0 ? selIdx : sorted.length - 1
  const windowMonths = sorted.slice(Math.max(0, endIdx - 11), endIdx + 1)
  const windowTabs = new Set(windowMonths.map((m) => m.tab))

  // --- Panel 1: net worth / cash / card-debt chart ------------------------
  // A month with no bank data at all (p.cash == null) must NOT fabricate a
  // net worth by treating the missing cash figure as 0 — that would render
  // a confident-looking number built entirely from savings/upcoming while
  // silently dropping the biggest input. null here is a genuine gap: the
  // Line below leaves it ungraphed (connectNulls={false}) and the table
  // renders it as Money's own dash, same as a null cash figure anywhere
  // else in the app.
  const chartData = windowMonths.map((m) => {
    const p = monthMetrics(m)
    const nw = p.cash == null ? null : round2(p.cash + (p.savings ?? 0) - p.upcoming)
    return { tab: m.tab, nw, cash: p.cash, debt: round2(-p.upcoming) }
  })

  // --- Panel 2: month-by-month table --------------------------------------
  const monthRows = windowMonths.map((m) => {
    const p = monthMetrics(m)
    const nw = p.cash == null ? null : round2(p.cash + (p.savings ?? 0) - p.upcoming)
    const rate = p.income > 0 ? (p.saved / p.income) * 100 : null
    return {
      tab: m.tab,
      income: p.income,
      expenses: p.expenses,
      saved: p.saved,
      rate,
      cash: p.cash,
      upcoming: p.upcoming,
      nw,
      topCategory: topCategoryFor(m, overrides),
    }
  })

  // --- Panel 3: category trend table ---------------------------------------
  // topN large enough that no category ever folds into a synthetic "other"
  // bucket — this table wants every category with window spend, ranked by
  // its own window total, not top-N + other.
  const allSeries = categorySeries(months, overrides, 999)
  const categoryRows = allSeries
    .map((s) => {
      const windowPoints = s.points.filter((pt) => windowTabs.has(pt.tab))
      const windowTotal = round2(windowPoints.reduce((sum, pt) => sum + pt.value, 0))
      const fullIdx = s.points.findIndex((pt) => pt.tab === selectedMonth.tab)
      const thisMonth = fullIdx >= 0 ? s.points[fullIdx].value : (windowPoints[windowPoints.length - 1]?.value ?? 0)
      // 6-mo avg anchored strictly BEFORE the selected month (same
      // "don't average future months when browsing an old month" fix as
      // Task 8) — never include the selected month or anything after it.
      const priorPoints = fullIdx >= 0 ? s.points.slice(0, fullIdx) : s.points.slice(0, -1)
      const last6 = priorPoints.slice(-6)
      const avg = last6.length > 0 ? round2(last6.reduce((sum, pt) => sum + pt.value, 0) / last6.length) : null
      const delta = avg == null ? null : round2(thisMonth - avg)
      return { category: s.category, sparkline: windowPoints.map((pt) => pt.value), windowTotal, thisMonth, avg, delta }
    })
    .filter((r) => r.windowTotal !== 0)
    .sort((a, b) => b.windowTotal - a.windowTotal)

  return (
    <div className="trends-screen">
      <div className="panel2">
        <div className="panel2-head">
          <span>Net worth &amp; cash — 12 months</span>
          <span className="panel2-meta">{windowMonths.length} months</span>
        </div>
        <div style={{ display: 'flex', gap: 14, padding: '10px 14px 0', fontSize: 13 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="dot" style={{ background: palette.categorical[0] }} />
            Net worth
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="dot" style={{ background: palette.deltaGood }} />
            Cash
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="dot" style={{ background: palette.categorical[1] }} />
            Card debt
          </span>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart
            data={chartData}
            margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
            onClick={(e) => {
              if (e?.activeLabel != null) onSelectMonth?.(String(e.activeLabel))
            }}
          >
            <CartesianGrid stroke={palette.gridline} vertical={false} />
            <XAxis
              dataKey="tab"
              stroke={palette.axis}
              tick={{ fill: palette.textMuted, fontSize: 13 }}
              tickLine={false}
              axisLine={{ stroke: palette.axis }}
            />
            <YAxis
              stroke={palette.axis}
              tick={{ fill: palette.textMuted, fontSize: 13 }}
              tickLine={false}
              axisLine={false}
              width={56}
            />
            <Tooltip
              cursor={{ stroke: palette.axis, strokeWidth: 1 }}
              content={(props) => (
                // Guard against a null cash month: recharts' payload still
                // carries a `{ value: null }` entry for a gapped Line (the
                // Line itself correctly skips drawing it — connectNulls is
                // false), but ChartTooltip's `Number(p.value)` would coerce
                // that null to 0 and render a fabricated "€0.00" row. Filter
                // it out here rather than teaching the shared ChartTooltip
                // about a null-is-a-gap convention only this chart needs.
                <ChartTooltip
                  {...props}
                  payload={props.payload?.filter((p) => p.value != null)}
                  palette={palette}
                  formatValue={fmtEUR}
                />
              )}
            />
            <Line
              type="monotone"
              dataKey="nw"
              name="Net worth"
              stroke={palette.categorical[0]}
              strokeWidth={2.2}
              dot={false}
              isAnimationActive={false}
              connectNulls={false}
            />
            <Line type="monotone" dataKey="cash" name="Cash" stroke={palette.deltaGood} strokeWidth={1.6} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="debt" name="Card debt" stroke={palette.categorical[1]} strokeWidth={1.6} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="panel2">
        <div className="panel2-head">
          <span>Month by month</span>
          <span className="panel2-meta">click a row to select it</span>
        </div>
        <div className="dg-cols" style={{ gridTemplateColumns: MONTH_COLS }}>
          <span>Month</span>
          <span className="right">Income</span>
          <span className="right">Expenses</span>
          <span className="right">Saved</span>
          <span className="right">Rate</span>
          <span className="right">Cash</span>
          <span className="right">Upcoming</span>
          <span className="right">Net worth</span>
          <span>Top category</span>
        </div>
        {monthRows.map((r) => {
          const isSelected = r.tab === selectedMonth.tab
          const savedColor = r.saved >= 0 ? 'var(--green)' : 'var(--red)'
          return (
            <div
              key={r.tab}
              className="dg-row clickable"
              style={{ gridTemplateColumns: MONTH_COLS, background: isSelected ? 'var(--surface-2)' : undefined }}
              role="button"
              tabIndex={0}
              aria-label={`Select ${r.tab}`}
              onClick={() => onSelectMonth?.(r.tab)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSelectMonth?.(r.tab)
                }
              }}
            >
              <span className="num">{r.tab}</span>
              <span className="right">
                <Money amountEUR={r.income} tabular />
              </span>
              <span className="right">
                <Money amountEUR={r.expenses} tabular />
              </span>
              <span className="right" style={{ color: savedColor }}>
                {r.saved >= 0 && '+'}
                <Money amountEUR={r.saved} tabular />
              </span>
              <span className="right">{r.rate == null ? '—' : `${Math.round(r.rate)}%`}</span>
              <span className="right">
                <Money amountEUR={r.cash} tabular />
              </span>
              <span className="right" style={{ color: 'var(--brick)' }}>
                <Money amountEUR={r.upcoming} tabular />
              </span>
              <span className="right" style={{ color: palette.categorical[0] }}>
                <Money amountEUR={r.nw} tabular />
              </span>
              <span>{r.topCategory ?? '—'}</span>
            </div>
          )
        })}
      </div>

      <div className="panel2">
        <div className="panel2-head">
          <span>Category trend — 12 months</span>
          <span className="panel2-meta">{categoryRows.length} categories</span>
        </div>
        {categoryRows.length === 0 ? (
          <EmptyState message="No categorized expenses in this window." />
        ) : (
          <>
            <div className="dg-cols" style={{ gridTemplateColumns: CATEGORY_COLS }}>
              <span />
              <span>Category</span>
              <span>Trend</span>
              <span className="right">This month</span>
              <span className="right">6-mo avg</span>
              <span className="right">vs avg</span>
            </div>
            {categoryRows.map((r) => {
              const color = categoryColor(r.category, palette)
              const deltaColor = r.delta == null ? undefined : r.delta > 0 ? 'var(--red)' : r.delta < 0 ? 'var(--green)' : undefined
              return (
                <div className="dg-row" style={{ gridTemplateColumns: CATEGORY_COLS }} key={r.category}>
                  <span className="dot" style={{ background: color }} />
                  <span>{r.category}</span>
                  <Sparkline data={r.sparkline} height={28} />
                  <span className="right">
                    <Money amountEUR={r.thisMonth} tabular />
                  </span>
                  <span className="right">{r.avg == null ? '—' : <Money amountEUR={r.avg} tabular />}</span>
                  <span className="right" style={{ color: deltaColor }}>
                    {r.delta == null ? (
                      '—'
                    ) : (
                      <>
                        {r.delta > 0 && '+'}
                        <Money amountEUR={r.delta} tabular />
                      </>
                    )}
                  </span>
                </div>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}
