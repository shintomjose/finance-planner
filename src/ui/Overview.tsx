// Overview screen (template redesign, Task 7): a 3-column datagrid layout
// driven entirely by the global month-pill selection (`selectedMonth`) —
// no internal "which month to show" logic here anymore (that lived in
// pickDisplayedMonth pre-Task 6; App.tsx/Layout.tsx own it now).
//
// Every number on this screen comes from an already-tested lib rather than
// being recomputed inline:
//  - category breakdown: categorize()/normLabel() (normalize.ts) bucket
//    selectedMonth.expenses; budget/variance columns are sourced from
//    budgetActuals()'s rows (matched on normLabel(category) — see the
//    per-column comment below for why the match is on the CATEGORY STRING,
//    not budgetActuals' own `actual`).
//  - income: groupIncome() (incomeGroups.ts). Carryover is NOT income (repo
//    golden rule — see foodHome.ts/normalize.ts skill notes): it renders as
//    a separate muted row below the groups, excluded from the income total,
//    which is overviewFigures().incomeOwn (income Tx only).
//  - savings progress: overviewFigures() per month across the trailing
//    6-month window ending at the selected month (sortByPeriod, mathUtils).
//    Target rule (locked): plan.budgetTotals.surplus when present and > 0,
//    else null — bars then scale to the window's own max |saved| instead of
//    a fixed floor, and the amber tier (which only makes sense relative to
//    a target) drops out.
//  - upcoming: partitionUpcoming() (foodHome.ts) splits the Food Home
//    budget-tracker row out of the payable-bills list — it's a monthly
//    budget remaining figure, not a bill, so it renders as its own muted
//    "Food budget remaining" row excluded from the bills total. Provider
//    grouping is groupUpcoming() (upcomingProviders.ts). Coverage compares
//    cash+savings (the Bank accounts panel's own total — "Available +
//    savings") against the bills total.
import { useState } from 'react'
import { budgetActuals } from '../lib/budgetActuals'
import { partitionUpcoming } from '../lib/foodHome'
import { groupIncome } from '../lib/incomeGroups'
import { round2, sortByPeriod, sumAmounts } from '../lib/mathUtils'
import { categorize, normLabel } from '../lib/normalize'
import { overviewFigures } from '../lib/overviewFigures'
import { groupUpcoming } from '../lib/upcomingProviders'
import type { MonthlyPlanData } from '../parse/monthlyPlan'
import { DEFAULT_STATE } from '../state/appState'
import type { AppState } from '../state/appState'
import type { MonthData, Tx } from '../types'
import { getPalette } from './charts/palette'
import { useColorScheme } from './charts/useColorScheme'
import { BarMeter, EmptyState, Money } from './shared'

const eurFmt = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
const fmtEUR = (v: number) => eurFmt.format(v)

interface CategoryRow {
  category: string
  items: Tx[]
  total: number
  budget: number | null
  variance: number | null
}

const CAT_COLS = '10px 1fr 40px 100px 88px 76px 84px'
const INCOME_COLS = '1fr 40px 100px 88px'
const SAVINGS_COLS = 'auto 1fr 88px 56px'
const BANK_COLS = '1fr 88px'
const UPCOMING_COLS = '1fr 40px 88px'

/** One row inside a `.dg-inset` — reused by the category, income-group and
 * upcoming-provider expansions. A planned/blank-amount entry (D-column
 * blank in the sheet = planned/unpaid, never coerced to zero — see
 * normalize.ts skill notes) is dimmed rather than shown as a real €0; the
 * `Money` component already renders the dash for a null amount. */
function InsetRow({ label, amount, planned }: { label: string; amount: number | null; planned?: boolean }) {
  const dim = planned || amount == null
  return (
    <div
      style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '4px 0', fontSize: 12 }}
      className={dim ? 'dg-row muted' : undefined}
    >
      <span>{label}</span>
      <Money amountEUR={amount} tabular />
    </div>
  )
}

export function Overview({
  months,
  selectedMonth,
  plan,
  appState,
}: {
  months: MonthData[]
  selectedMonth: MonthData
  plan?: MonthlyPlanData | null
  appState?: AppState
}) {
  const scheme = useColorScheme()
  const palette = getPalette(scheme)
  const overrides = (appState ?? DEFAULT_STATE).categoryOverrides

  const [expandedCategory, setExpandedCategory] = useState<string | null>(null)
  const [openIncome, setOpenIncome] = useState<Record<string, boolean>>({})
  const [openUpcoming, setOpenUpcoming] = useState<Record<string, boolean>>({})

  const figures = overviewFigures(selectedMonth)

  // --- Panel 1: Expenses by category -----------------------------------
  const byCategory = new Map<string, Tx[]>()
  for (const tx of selectedMonth.expenses) {
    const cat = categorize(tx.normLabel, overrides)
    const bucket = byCategory.get(cat)
    if (bucket) bucket.push(tx)
    else byCategory.set(cat, [tx])
  }

  // budgetActuals needs a `now` for pctOfMonth/pctOfBudget pacing fields —
  // this screen only reads `plannedMonthly` off its rows, which those
  // fields don't affect, so the exact instant passed here is immaterial.
  const budgetView = plan ? budgetActuals(selectedMonth, plan.budget, overrides, new Date(), plan.budgetTotals.surplus) : null
  const budgetByCategory = new Map<string, number>()
  if (budgetView) {
    for (const row of budgetView.rows) {
      const key = normLabel(row.category)
      if (!budgetByCategory.has(key)) budgetByCategory.set(key, row.plannedMonthly)
    }
  }

  const categoryRows: CategoryRow[] = [...byCategory.entries()]
    .map(([category, items]) => {
      const total = round2(sumAmounts(items))
      const budget = budgetByCategory.get(category) ?? null
      const variance = budget == null ? null : round2(budget - total)
      return { category, items, total, budget, variance }
    })
    .sort((a, b) => b.total - a.total)

  const totalExpense = round2(sumAmounts(selectedMonth.expenses))
  const totalBudgetMatched = categoryRows.reduce((s, r) => s + (r.budget ?? 0), 0)
  const anyBudgetMatched = categoryRows.some((r) => r.budget != null)
  const totalVarianceMatched = anyBudgetMatched ? round2(totalBudgetMatched - categoryRows.reduce((s, r) => (r.budget != null ? s + r.total : s), 0)) : null

  // --- Panel 2a: Income sources -----------------------------------------
  const incomeGroups = groupIncome(selectedMonth.income)
  const incomeTotal = figures.incomeOwn

  // --- Panel 2b: Savings progress ----------------------------------------
  const sortedMonths = sortByPeriod(months)
  const selIdx = sortedMonths.findIndex((m) => m.tab === selectedMonth.tab)
  const endIdx = selIdx >= 0 ? selIdx : sortedMonths.length - 1
  const savingsWindow = sortedMonths.slice(Math.max(0, endIdx - 5), endIdx + 1)
  // Locked rule: a real, positive plan surplus is the target; otherwise
  // there is no target at all (never a hardcoded fallback figure) and the
  // bars scale to the window's own max |saved| instead.
  const target = plan?.budgetTotals.surplus != null && plan.budgetTotals.surplus > 0 ? plan.budgetTotals.surplus : null
  const savedPoints = savingsWindow.map((m) => {
    const f = overviewFigures(m)
    const saved = round2(f.incomeOwn - f.expense)
    const rate = f.incomeOwn > 0 ? saved / f.incomeOwn : null
    return { tab: m.tab, saved, rate }
  })
  const maxAbsSaved = Math.max(1, ...savedPoints.map((p) => Math.abs(p.saved)))
  const savingsDenom = target ?? maxAbsSaved
  const totalSaved6 = round2(savedPoints.reduce((s, p) => s + p.saved, 0))

  // --- Panel 3a: Bank accounts --------------------------------------------
  const bankTotal = selectedMonth.bankTotal ?? round2(selectedMonth.banks.reduce((s, b) => s + b.amountEUR, 0))

  // --- Panel 3b: Upcoming to pay -------------------------------------------
  const { bills, foodHomeRemaining } = partitionUpcoming(selectedMonth.upcoming)
  const billsTotal = round2(bills.reduce((s, u) => s + (u.toPay ?? 0), 0))
  const coverage = round2(bankTotal - billsTotal)
  const providerGroups = groupUpcoming(bills)
  const coverageNote =
    coverage >= 0 ? `Covered by cash + savings with ${fmtEUR(coverage)} to spare.` : `Obligations exceed cash + savings by ${fmtEUR(Math.abs(coverage))}.`

  return (
    <div className="overview-grid">
      {/* Panel 1: Expenses by category */}
      <div className="panel2">
        <div className="panel2-head">
          <span>Expenses by category</span>
          <span className="panel2-meta">{categoryRows.length} categories</span>
        </div>
        {categoryRows.length === 0 ? (
          <EmptyState message="No expenses recorded." />
        ) : (
          <>
            <div className="dg-cols" style={{ gridTemplateColumns: CAT_COLS }}>
              <span />
              <span>Category</span>
              <span className="right">Items</span>
              <span>Share</span>
              <span className="right">Actual</span>
              <span className="right">Budget</span>
              <span className="right">Var</span>
            </div>
            {categoryRows.map((row, i) => {
              const color = palette.categorical[i % 8]
              const sharePct = totalExpense > 0 ? (row.total / totalExpense) * 100 : 0
              const varianceColor = row.variance == null ? undefined : row.variance >= 0 ? 'var(--green)' : 'var(--red)'
              const isOpen = expandedCategory === row.category
              const sortedItems = [...row.items].sort((a, b) => (b.amountEUR ?? -Infinity) - (a.amountEUR ?? -Infinity))
              return (
                <div key={row.category}>
                  <div
                    className="dg-row clickable"
                    style={{ gridTemplateColumns: CAT_COLS }}
                    role="button"
                    tabIndex={0}
                    onClick={() => setExpandedCategory(isOpen ? null : row.category)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') setExpandedCategory(isOpen ? null : row.category)
                    }}
                  >
                    <span className="dot" style={{ background: color }} />
                    <span>{row.category}</span>
                    <span className="right">{row.items.length}</span>
                    <BarMeter pct={sharePct} color={color} />
                    <span className="right">
                      <Money amountEUR={row.total} tabular />
                    </span>
                    <span className="right">{row.budget == null ? '—' : <Money amountEUR={row.budget} tabular />}</span>
                    <span className="right" style={{ color: varianceColor }}>
                      {row.variance == null ? '—' : <Money amountEUR={row.variance} tabular />}
                    </span>
                  </div>
                  {isOpen && (
                    <div className="dg-inset">
                      {sortedItems.map((tx) => (
                        <InsetRow key={`${tx.tab}-${tx.row}-${tx.label}`} label={tx.label} amount={tx.amountEUR} planned={tx.planned} />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
            <div className="dg-foot" style={{ gridTemplateColumns: CAT_COLS }}>
              <span />
              <span>Total</span>
              <span className="right">{selectedMonth.expenses.length}</span>
              <span />
              <span className="right">
                <Money amountEUR={totalExpense} tabular />
              </span>
              <span className="right">{plan && anyBudgetMatched ? <Money amountEUR={totalBudgetMatched} tabular /> : '—'}</span>
              <span className="right">{totalVarianceMatched == null ? '—' : <Money amountEUR={totalVarianceMatched} tabular />}</span>
            </div>
          </>
        )}
      </div>

      {/* Column 2: Income sources + Savings progress */}
      <div className="col-stack">
        <div className="panel2">
          <div className="panel2-head">
            <span>Income sources</span>
            <span className="panel2-meta">{incomeGroups.length} sources</span>
          </div>
          {incomeGroups.length === 0 && figures.carryover === 0 ? (
            <EmptyState message="No income recorded." />
          ) : (
            <>
              {incomeGroups.map((g) => {
                const isOpen = !!openIncome[g.name]
                const sharePct = incomeTotal > 0 ? (g.total / incomeTotal) * 100 : 0
                return (
                  <div key={g.name}>
                    <div
                      className="dg-row clickable"
                      style={{ gridTemplateColumns: INCOME_COLS }}
                      role="button"
                      tabIndex={0}
                      onClick={() => setOpenIncome((p) => ({ ...p, [g.name]: !p[g.name] }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') setOpenIncome((p) => ({ ...p, [g.name]: !p[g.name] }))
                      }}
                    >
                      <span>{g.name}</span>
                      <span className="right">{g.items.length}</span>
                      <BarMeter pct={sharePct} />
                      <span className="right">
                        <Money amountEUR={g.total} tabular />
                      </span>
                    </div>
                    {isOpen && (
                      <div className="dg-inset">
                        {g.items.map((item, idx) => (
                          <InsetRow key={`${item.label}-${idx}`} label={item.label} amount={item.amountEUR} planned={item.planned} />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
              <div className="dg-row muted" style={{ gridTemplateColumns: INCOME_COLS }}>
                <span>Carryover from last month</span>
                <span />
                <span />
                <span className="right">
                  <Money amountEUR={figures.carryover} tabular />
                </span>
              </div>
              <div className="dg-foot" style={{ gridTemplateColumns: INCOME_COLS }}>
                <span>Total</span>
                <span />
                <span />
                <span className="right">
                  <Money amountEUR={incomeTotal} tabular />
                </span>
              </div>
            </>
          )}
        </div>

        <div className="panel2">
          <div className="panel2-head">
            <span>Savings progress</span>
            <span className="panel2-meta">{target != null ? `target ${fmtEUR(target)}` : 'no target'}</span>
          </div>
          {savedPoints.length === 0 ? (
            <EmptyState message="Not enough months to chart savings progress." />
          ) : (
            <>
              {savedPoints.map((p) => {
                const pct = Math.min(100, (Math.abs(p.saved) / savingsDenom) * 100)
                const color =
                  target != null
                    ? p.saved >= target
                      ? 'var(--green)'
                      : p.saved >= 0
                        ? 'var(--amber)'
                        : 'var(--red)'
                    : p.saved >= 0
                      ? 'var(--green)'
                      : 'var(--red)'
                return (
                  <div className="dg-row" style={{ gridTemplateColumns: SAVINGS_COLS }} key={p.tab}>
                    <span>{p.tab}</span>
                    <BarMeter pct={pct} color={color} />
                    <span className="right" style={{ color }}>
                      {p.saved >= 0 && '+'}
                      <Money amountEUR={p.saved} tabular />
                    </span>
                    <span className="right">{p.rate == null ? '—' : `${Math.round(p.rate * 100)}%`}</span>
                  </div>
                )
              })}
              <div className="dg-foot" style={{ gridTemplateColumns: SAVINGS_COLS }}>
                <span>Saved in last 6 months</span>
                <span />
                <span className="right">
                  <Money amountEUR={totalSaved6} tabular />
                </span>
                <span />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Column 3: Bank accounts + Upcoming to pay */}
      <div className="col-stack">
        <div className="panel2">
          <div className="panel2-head">
            <span>Bank accounts</span>
            <span className="panel2-meta">{selectedMonth.banks.length} accounts</span>
          </div>
          {selectedMonth.banks.length === 0 ? (
            <EmptyState message="No bank accounts recorded." />
          ) : (
            <>
              {selectedMonth.banks.map((b) => (
                <div className="dg-row" style={{ gridTemplateColumns: BANK_COLS }} key={b.name}>
                  <span>{b.name}</span>
                  <span className="right">
                    <Money amountEUR={b.amountEUR} tabular />
                  </span>
                </div>
              ))}
              <div className="dg-foot" style={{ gridTemplateColumns: BANK_COLS }}>
                <span>Available + savings</span>
                <span className="right">
                  <Money amountEUR={bankTotal} tabular />
                </span>
              </div>
            </>
          )}
        </div>

        <div className="panel2" data-tone={coverage < 0 ? 'bad' : undefined}>
          <div className="panel2-head">
            <span>Upcoming to pay</span>
            <span className="panel2-meta">{bills.length} bills</span>
          </div>
          <div className="dg-note">{coverageNote}</div>
          {providerGroups.length === 0 && foodHomeRemaining == null ? (
            <EmptyState message="Nothing upcoming." />
          ) : (
            <>
              {providerGroups.map((g) => {
                const isOpen = !!openUpcoming[g.name]
                return (
                  <div key={g.name}>
                    <div
                      className="dg-row clickable"
                      style={{ gridTemplateColumns: UPCOMING_COLS }}
                      role="button"
                      tabIndex={0}
                      onClick={() => setOpenUpcoming((p) => ({ ...p, [g.name]: !p[g.name] }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') setOpenUpcoming((p) => ({ ...p, [g.name]: !p[g.name] }))
                      }}
                    >
                      <span>{g.name}</span>
                      <span className="right">{g.items.length}</span>
                      <span className="right">
                        <Money amountEUR={g.total} tabular />
                      </span>
                    </div>
                    {isOpen && (
                      <div className="dg-inset">
                        {g.items.map((item, idx) => (
                          <InsetRow key={`${item.label}-${idx}`} label={item.label} amount={item.toPay} />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
              {foodHomeRemaining != null && (
                <div className="dg-row muted" style={{ gridTemplateColumns: UPCOMING_COLS }}>
                  <span>Food budget remaining</span>
                  <span />
                  <span className="right">
                    <Money amountEUR={foodHomeRemaining} tabular />
                  </span>
                </div>
              )}
              <div className="dg-foot" style={{ gridTemplateColumns: UPCOMING_COLS }}>
                <span>Total to pay</span>
                <span />
                <span className="right">
                  <Money amountEUR={billsTotal} tabular />
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
