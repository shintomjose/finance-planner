// Budget vs Actual screen (template redesign, Task 8): a two-panel datagrid
// layout matching Overview/Trends' template language (`.panel2`/`.dg-*` —
// see app.css's "Datagrid primitives" block, Task 7). Month selection is no
// longer local — the global month-pill row (Layout.tsx) owns it and passes
// `selectedMonth` down; this screen has no month picker of its own.
//
// All the matching/pacing math still lives in ../../lib/budgetActuals — this
// component only renders the resulting BudgetView plus two additions of its
// own, both recomputed here rather than trusted from a sheet cell (golden
// rule):
//  - a "6-mo avg" column per category, sourced from trends.ts's
//    categorySeries() (topN = MAX_SAFE_INTEGER so nothing folds into
//    'other'), matched to a budget row by normLabel(category). Because
//    categorySeries buckets by categorize() (coarse buckets like "fixed",
//    "groceries") while most MONTHLY_PLAN budget rows are granular expense
//    labels ("Rent", "Vodafone" — see budgetActuals.ts's tier-1/tier-2
//    comment), most budget rows simply have no matching series and render
//    "—" here; only budget rows that ARE spelled as a bucket name (or any
//    unbudgeted row, whose category IS a bucket name by construction) get a
//    real average. That's a real data-shape limitation, not a bug in this
//    screen — it isn't in scope to change budgetActuals' matching here.
//  - the "All line items" search panel, which reads selectedMonth.expenses
//    directly (categorize()/normLabel() for the category shown per row).
//
// The Food Home budget row keeps its live-indicator special case (owner
// live-review, 2026-07-26; ../../lib/foodHome): its "actual"/"left" columns
// come from the same budgetActuals matching as every other row, but a
// second note line under that one row surfaces the sheet's own "remaining
// this month" figure for the monthly food budget, since that (not the
// budgetActuals matched actual) is the number that means "how much of this
// month's food budget is left".
import { Fragment, useMemo, useState } from 'react'
import { budgetActuals } from '../../lib/budgetActuals'
import { FOOD_HOME_LABEL, foodHomeRemainingFor } from '../../lib/foodHome'
import { round2 } from '../../lib/mathUtils'
import { categorize, normLabel } from '../../lib/normalize'
import { categorySeries } from '../../lib/trends'
import type { MonthlyPlanData } from '../../parse/monthlyPlan'
import type { AppState } from '../../state/appState'
import type { MonthData, Tx } from '../../types'
import { BarMeter, EmptyState, Money } from '../shared'

export interface BudgetScreenProps {
  months: MonthData[]
  plan: MonthlyPlanData | null
  state: AppState
  now: Date
  selectedMonth: MonthData
}

const eurFmt = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
const fmtEUR = (v: number) => (Number.isFinite(v) ? eurFmt.format(v) : eurFmt.format(0))
const fmtPct = (v: number) => (Number.isFinite(v) ? `${Math.round(v)}%` : '∞%')

const BUDGET_COLS = '1fr 120px 96px 96px 88px 88px'
const ITEMS_COLS = '1fr 150px 96px'

/** Desc-by-amount comparator that treats a null amount (planned/blank D
 * column) as "sorts last" — same shape as Overview's local comparator, kept
 * here rather than shared since it's a UI presentation concern, not a lib
 * calc (mirrors the existing per-screen pattern). */
function compareAmountDesc(a: number | null, b: number | null): number {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  return b - a
}

function usageColor(pct: number): string {
  if (pct > 100) return 'var(--red)'
  if (pct > 90) return 'var(--amber)'
  return 'var(--green)'
}

export function Budget({ months, plan, state, now, selectedMonth }: BudgetScreenProps) {
  const overrides = state.categoryOverrides
  const [query, setQuery] = useState('')

  // 6-mo avg source: category-bucket monthly series across ALL months
  // (large topN so every bucket gets its own series, none rolled into
  // 'other'), keyed by normLabel for lookup against budget-row category text.
  const series = useMemo(() => categorySeries(months, overrides, Number.MAX_SAFE_INTEGER), [months, overrides])
  const seriesByKey = useMemo(() => new Map(series.map((s) => [normLabel(s.category), s])), [series])

  const sixMonthAvg = (category: string): number | null => {
    const entry = seriesByKey.get(normLabel(category))
    if (!entry) return null
    const points = entry.points.filter((p) => p.tab !== selectedMonth.tab).slice(-6)
    if (points.length === 0) return null
    return round2(points.reduce((sum, p) => sum + p.value, 0) / points.length)
  }

  if (!plan) {
    return (
      <EmptyState
        title="Budget"
        message="No MONTHLY_PLAN data connected yet — the budget plan will appear here once it's wired up."
      />
    )
  }

  const view = budgetActuals(selectedMonth, plan.budget, overrides, now, plan.budgetTotals.surplus)
  const foodHomeRemaining = foodHomeRemainingFor(selectedMonth)

  const planMetaColor = view.totals.surplus >= 0 ? 'var(--green)' : 'var(--red)'
  const planMetaText =
    view.totals.surplus >= 0
      ? `${fmtEUR(view.totals.surplus)} under plan`
      : `${fmtEUR(Math.abs(view.totals.surplus))} over plan`

  const q = query.trim().toLowerCase()
  const allItems: Tx[] = selectedMonth.expenses
  const filteredItems = allItems
    .filter((tx) => {
      if (!q) return true
      const cat = categorize(tx.normLabel, overrides)
      return tx.label.toLowerCase().includes(q) || cat.toLowerCase().includes(q)
    })
    .sort((a, b) => compareAmountDesc(a.amountEUR, b.amountEUR))

  return (
    <div className="budget-grid">
      <div className="panel2">
        <div className="panel2-head">
          <span>Budget vs actual — {selectedMonth.tab}</span>
          <span className="panel2-meta" style={{ color: planMetaColor }}>
            {planMetaText}
          </span>
        </div>
        {view.rows.length === 0 && view.unbudgeted.length === 0 ? (
          <EmptyState message="No budget categories found in MONTHLY_PLAN." />
        ) : (
          <>
            <div className="dg-cols" style={{ gridTemplateColumns: BUDGET_COLS }}>
              <span>Category</span>
              <span>Used of budget</span>
              <span className="right">Actual</span>
              <span className="right">Budget</span>
              <span className="right">Left</span>
              <span className="right">6-mo avg</span>
            </div>
            {view.rows.map((row) => {
              const left = round2(row.plannedMonthly - row.actual)
              const avg = sixMonthAvg(row.category)
              const isFoodHome = normLabel(row.category) === FOOD_HOME_LABEL
              return (
                <Fragment key={row.category}>
                  <div className="dg-row" style={{ gridTemplateColumns: BUDGET_COLS }}>
                    <span>{row.category}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <BarMeter pct={row.pctOfBudget} color={usageColor(row.pctOfBudget)} />
                      <span className="num" style={{ fontSize: 11, color: 'var(--muted)' }}>
                        {fmtPct(row.pctOfBudget)}
                      </span>
                    </span>
                    <span className="right">
                      <Money amountEUR={row.actual} tabular />
                    </span>
                    <span className="right">
                      <Money amountEUR={row.plannedMonthly} tabular />
                    </span>
                    <span className="right" style={{ color: left >= 0 ? 'var(--green)' : 'var(--red)' }}>
                      <Money amountEUR={left} tabular />
                    </span>
                    <span className="right">{avg == null ? '—' : <Money amountEUR={avg} tabular />}</span>
                  </div>
                  {isFoodHome && foodHomeRemaining != null && (
                    <div className="dg-note">
                      Food Home remaining this month (sheet): <Money amountEUR={foodHomeRemaining} tabular />
                    </div>
                  )}
                </Fragment>
              )
            })}
            {view.unbudgeted.map((u) => {
              const avg = sixMonthAvg(u.category)
              return (
                <div className="dg-row" style={{ gridTemplateColumns: BUDGET_COLS }} key={`unbudgeted-${u.category}`}>
                  <span>{u.category}</span>
                  <span>—</span>
                  <span className="right">
                    <Money amountEUR={u.actual} tabular />
                  </span>
                  <span className="right">—</span>
                  <span className="right">—</span>
                  <span className="right">{avg == null ? '—' : <Money amountEUR={avg} tabular />}</span>
                </div>
              )
            })}
            <div className="dg-foot" style={{ gridTemplateColumns: BUDGET_COLS }}>
              <span>Total</span>
              <span />
              <span className="right">
                <Money amountEUR={view.totals.actual} tabular />
              </span>
              <span className="right">
                <Money amountEUR={view.totals.planned} tabular />
              </span>
              <span className="right" style={{ color: view.totals.surplus >= 0 ? 'var(--green)' : 'var(--red)' }}>
                <Money amountEUR={view.totals.surplus} tabular />
              </span>
              <span />
            </div>
          </>
        )}
      </div>

      <div className="panel2">
        <div className="panel2-head">
          <span>All line items</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              className="dg-search"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search label or category…"
              aria-label="Search line items"
            />
            <span className="panel2-meta">
              {filteredItems.length} of {allItems.length}
            </span>
          </div>
        </div>
        {allItems.length === 0 ? (
          <EmptyState message="No expenses recorded this month." />
        ) : (
          <div className="dg-body-scroll">
            <div className="dg-cols" style={{ gridTemplateColumns: ITEMS_COLS }}>
              <span>Label</span>
              <span>Category</span>
              <span className="right">Amount</span>
            </div>
            {filteredItems.map((tx) => {
              const cat = categorize(tx.normLabel, overrides)
              const dim = tx.planned || tx.amountEUR == null
              return (
                <div
                  key={`${tx.tab}-${tx.row}-${tx.label}`}
                  className={dim ? 'dg-row muted' : 'dg-row'}
                  style={{ gridTemplateColumns: ITEMS_COLS }}
                >
                  <span>{tx.label}</span>
                  <span>{cat}</span>
                  <span className="right">
                    <Money amountEUR={tx.amountEUR} tabular />
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
