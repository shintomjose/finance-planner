// Overview screen (template redesign, Task 7; amended post-review): a
// 3-column datagrid layout driven entirely by the global month-pill
// selection (`selectedMonth`) — no internal "which month to show" logic
// here anymore (that lived in pickDisplayedMonth pre-Task 6; App.tsx/
// Layout.tsx own it now).
//
// Every number on this screen comes from an already-tested lib rather than
// being recomputed inline:
//  - category breakdown: categorize()/normLabel() (normalize.ts) bucket
//    selectedMonth.expenses; the Budget/Var columns are sourced by
//    aggregating plan.budget's OWN rows into the same buckets (each row's
//    plannedMonthly summed under categorize(normLabel(row.category),
//    overrides)) — not budgetActuals()'s rows, which stay keyed by each
//    row's own granular label (see budgetActuals.ts's tier-1/tier-2 doc
//    comment). budgetActuals' granular keys never matched this panel's
//    bucket keys (a real reviewer finding — "Rent"/"Vodafone" rows never
//    hit "fixed"), which is why the Budget/Var columns were dead before this
//    fix. The footer only shows Budget/Var when EVERY category row matched a
//    budget line — see the reconciliation comment above the footer JSX for
//    why a partial match can't reconcile.
//  - a drift note (amber, under the panel head) surfaces when
//    overviewFigures() reports the sheet's own totals disagreeing with the
//    app's recompute by more than a cent — same drift fields the old
//    per-card DriftHint used, just one compact line instead of a
//    per-StatCard hint (there's no stat-card strip on this screen anymore).
//  - income: groupIncome() (incomeGroups.ts). Carryover is NOT income (repo
//    golden rule — see foodHome.ts/normalize.ts skill notes): it renders as
//    a separate muted row below the groups, excluded from the income total,
//    which is overviewFigures().incomeOwn (income Tx only).
//  - savings progress: overviewFigures() per month across the trailing
//    6-month window ending at the selected month (sortByPeriod, mathUtils).
//    Target rule (locked): plan.budgetTotals.surplus when present and > 0,
//    else null. Bar denominator: `Math.max(target, 1200)` when a target
//    exists (a floor so a tiny target doesn't blow the bar to 100% on a
//    barely-positive month), else the window's own max |saved|.
//  - upcoming: partitionUpcoming() (foodHome.ts) splits the Food Home
//    budget-tracker row out of the payable-bills list — it's a monthly
//    budget remaining figure, not a bill, so it renders as its own muted
//    "Food budget remaining" row excluded from the bills total. Provider
//    grouping is groupUpcoming() (upcomingProviders.ts). Coverage compares
//    cash+savings (the Bank accounts panel's own total — "Available +
//    savings") against the bills total.
//  - credit cards: creditCardBills() (creditCardBills.ts) groups the
//    'credit card' bucket by card name — reintegrated per human-approved
//    review as a 4th column-3 panel (the old Overview had it as a
//    standalone card; the rebuild's `categorize()` bucket "credit card"
//    would otherwise fold these into the category panel's single row).
import { useState } from 'react'
import { cardDues, duesTotal, isDueCoveredUpcoming } from '../lib/cardDues'
import { creditCardBills } from '../lib/creditCardBills'
import { partitionUpcoming } from '../lib/foodHome'
import { groupIncome } from '../lib/incomeGroups'
import { lifetimeTotals } from '../lib/lifetimeTotals'
import { round2, sortByPeriod, sumAmounts } from '../lib/mathUtils'
import { categorize, normLabel } from '../lib/normalize'
import { overviewFigures } from '../lib/overviewFigures'
import { upcomingIncome } from '../lib/upcomingIncome'
import { groupUpcoming } from '../lib/upcomingProviders'
import type { MonthlyPlanData } from '../parse/monthlyPlan'
import { DEFAULT_STATE } from '../state/appState'
import type { AppState } from '../state/appState'
import type { MonthData, Tx } from '../types'
import { categoryColor } from './charts/categoryColor'
import { getPalette } from './charts/palette'
import { useColorScheme } from './charts/useColorScheme'
import { BarMeter, EmptyState, Money } from './shared'

const eurFmt = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
const fmtEUR = (v: number) => eurFmt.format(v)
const inrFmt = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const monthLabel = (m: Pick<MonthData, 'period'>) => `${MONTH_ABBR[m.period.month - 1]} '${String(m.period.year % 100).padStart(2, '0')}`

interface CategoryRow {
  category: string
  items: Tx[]
  total: number
  budget: number | null
  variance: number | null
}

const CAT_COLS = '10px minmax(0, 1fr) 48px 96px 92px 80px 84px'
const DUES_COLS = '1fr 110px'
const INCOME_COLS = '1fr 40px 100px 88px'
const SAVINGS_COLS = '72px minmax(40px, 1fr) 96px 44px'
const BANK_COLS = '1fr 88px'
const UPCOMING_COLS = '1fr 40px 88px'

/** Desc-by-amount comparator that treats a null amount (planned/blank D
 * column) as "sorts last", with a stable 0 when BOTH sides are null —
 * `(b ?? -Infinity) - (a ?? -Infinity)` returns NaN for two nulls
 * (`-Infinity - -Infinity`), which Array.sort leaves in an unspecified
 * order relative to its neighbors. */
function compareAmountDesc(a: number | null, b: number | null): number {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  return b - a
}

/** One row inside a `.dg-inset` — reused by the category, income-group and
 * upcoming-provider expansions. A planned/blank-amount entry (D-column
 * blank in the sheet = planned/unpaid, never coerced to zero — see
 * normalize.ts skill notes) is dimmed rather than shown as a real €0; the
 * `Money` component already renders the dash for a null amount. Uses its
 * own `.dg-inset-row` class (not `.dg-row`) — `.dg-row` carries a
 * bottom-hairline meant for a panel's top-level row list, which read as an
 * inconsistent extra rule once nested inside `.dg-inset`'s own padding. */
function InsetRow({ label, amount, planned }: { label: string; amount: number | null; planned?: boolean }) {
  const dim = planned || amount == null
  return (
    <div className={dim ? 'dg-inset-row muted' : 'dg-inset-row'}>
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
  const state = appState ?? DEFAULT_STATE
  const overrides = state.categoryOverrides
  const fxRate = state.fxRate

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

  // Bucket-aggregate plan.budget's own (granular) rows into the SAME
  // buckets categoryRows below is keyed by, so the Budget/Var columns
  // actually hit something (human-approved fix — see the file-header
  // comment for why budgetActuals()'s own granular-label rows can't be used
  // here directly). A row with a null plannedMonthly still marks its bucket
  // as "budgeted" (contributes 0, but the bucket key IS set) rather than
  // leaving the bucket looking unbudgeted just because one of its rows has
  // no planned figure.
  const budgetByCategory = new Map<string, number>()
  if (plan) {
    for (const b of plan.budget) {
      const bucket = categorize(normLabel(b.category), overrides)
      budgetByCategory.set(bucket, round2((budgetByCategory.get(bucket) ?? 0) + (b.plannedMonthly ?? 0)))
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
  const matchedCategoryCount = categoryRows.filter((r) => r.budget != null).length
  // Footer Var must equal Budget − (the footer's own Actual, which is
  // ALWAYS the full-month total — never just the matched subset). That
  // only holds when every category row matched a budget line: with a
  // partial match, "Budget" (sum of matched rows only) minus "Actual" (all
  // categories) isn't a meaningful variance, so both show '—' and the
  // panel head explains the partial coverage instead.
  const allCategoriesMatched = plan != null && categoryRows.length > 0 && matchedCategoryCount === categoryRows.length
  const footerBudget = allCategoriesMatched ? totalBudgetMatched : null
  const footerVariance = allCategoriesMatched ? round2(totalBudgetMatched - totalExpense) : null
  const budgetCoverageNote =
    plan && categoryRows.length > 0 && !allCategoriesMatched ? `budget covers ${matchedCategoryCount} of ${categoryRows.length} categories` : null

  // Drift note (human-approved reintegration of the old per-card
  // DriftHint, compacted to one line): only the figures where the sheet's
  // own cell disagrees with the app's recompute by more than a cent are
  // listed — overviewFigures() already returns null for anything that
  // agrees (or has no sheet cell to compare against).
  const driftPart = (label: string, sheetValue: number, recomputed: number | null): string | null =>
    recomputed == null ? null : `${label} ${fmtEUR(sheetValue)} vs ${fmtEUR(recomputed)}`
  const driftParts = [
    driftPart('income', figures.income, figures.incomeDrift),
    driftPart('expenses', figures.expense, figures.expenseDrift),
    driftPart('balance', figures.balance, figures.balanceDrift),
  ].filter((s): s is string => s != null)
  const driftNote = driftParts.length > 0 ? `Sheet totals drift from recomputed: ${driftParts.join(', ')}` : null

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
    return { tab: m.tab, label: monthLabel(m), saved, rate }
  })
  const maxAbsSaved = Math.max(1, ...savedPoints.map((p) => Math.abs(p.saved)))
  // Floor of 1200 when a target exists so a small target doesn't make the
  // bar slam to 100% on a barely-positive saved month; no floor at all
  // when there's no target (the window's own max |saved| is the scale).
  const savingsDenom = target != null ? Math.max(target, 1200) : maxAbsSaved
  const totalSaved6 = round2(savedPoints.reduce((s, p) => s + p.saved, 0))

  // --- Panel 3a: Bank accounts --------------------------------------------
  const bankTotal = selectedMonth.bankTotal ?? round2(selectedMonth.banks.reduce((s, b) => s + b.amountEUR, 0))

  // --- Panel 3b: Upcoming to pay -------------------------------------------
  // Card dues (spec 2026-07-27 §3/§6, Sachin row removed same day): scratch
  // statement balances, NOT the sheet's M/N/O rows. Statement rows in the
  // M/N/O list ("Advancia Credit Card", "Amazon CC", "Amex") and the bare
  // "Sachin" row (an income expectation, not an expense) are dropped from
  // the bills list; everything else stays.
  const dues = cardDues(selectedMonth)
  const duesSum = duesTotal(dues)
  const expectedIncome = upcomingIncome(selectedMonth)
  // No scratch data at all (pre-Nov-2024 tabs) → hide the dues sub-block
  // entirely; hasAnyDue below still keys the coverage-note suppression.
  const showDues = (selectedMonth.scratch ?? []).length > 0
  const { bills: allBills, foodHomeRemaining } = partitionUpcoming(selectedMonth.upcoming)
  const bills = allBills.filter((u) => !isDueCoveredUpcoming(u.name))
  const billsTotal = round2(bills.reduce((s, u) => s + (u.toPay ?? 0), 0))
  const toPayTotal = round2(duesSum + billsTotal)
  const coverage = round2(bankTotal - toPayTotal)
  const providerGroups = groupUpcoming(bills)
  // Suppress the coverage claim entirely for a month with nothing to cover
  // and nothing to cover it with — "Covered … with €0.00 to spare" over an
  // empty month reads as a real claim about data that was never recorded,
  // not a genuinely-covered position.
  const hasAnyDue = dues.some((d) => d.due != null)
  const coverageNote =
    selectedMonth.banks.length === 0 && bills.length === 0 && !hasAnyDue
      ? null
      : coverage >= 0
        ? `Covered by cash + savings with ${fmtEUR(coverage)} to spare.`
        : `Obligations exceed cash + savings by ${fmtEUR(Math.abs(coverage))}.`

  // --- Panel 3c: Debt / Credit (owner request 2026-07-27) -----------------
  // Net position = all upcoming expenses (dues + bills) − total savings
  // (bank total) − total expected income (K/L forecast block). Positive →
  // net debt (red), negative/zero → net credit (green).
  const expectedTotal = expectedIncome?.total ?? 0
  const netDebt = round2(toPayTotal - bankTotal - expectedTotal)

  // --- Hero band: lifetime totals (spec 2026-07-27 §4/§6) -----------------
  const lifetime = lifetimeTotals(months)

  // --- Panel 3c: Credit card bills (human-approved reintegration) --------
  const { rows: cardRows, total: cardTotal } = creditCardBills(selectedMonth.expenses, overrides)

  return (
    <div className="overview-screen">
      {/* Hero band: lifetime income + household average (spec §6) */}
      <div className="hero-band">
        <div className="hero-cell">
          <div className="kicker">Total income till now</div>
          <div className="hero-value num">
            <Money amountEUR={lifetime.totalEUR} tabular />
          </div>
          <div className="hero-sub num">
            {inrFmt.format(lifetime.totalEUR * fxRate)} <span className="hero-rate">@ {fxRate} ₹/€</span>
          </div>
          <div className="hero-note num">
            Salary {fmtEUR(lifetime.salaryEUR)} · KG {fmtEUR(lifetime.kgEUR)}
          </div>
        </div>
        <div className="hero-cell">
          <div className="kicker">Monthly AVG household</div>
          <div className="hero-value num">
            {lifetime.householdAvgEUR == null ? '—' : <Money amountEUR={lifetime.householdAvgEUR} tabular />}
          </div>
          <div className="hero-note num">
            {fmtEUR(lifetime.householdTotalEUR)} across {lifetime.monthCount} months
          </div>
          {lifetime.householdLow && lifetime.householdHigh && (
            <div className="hero-note num">
              <span style={{ color: 'var(--green)' }}>
                low {monthLabel(lifetime.householdLow)} {fmtEUR(lifetime.householdLow.amountEUR)}
              </span>
              {' · '}
              <span style={{ color: 'var(--red)' }}>
                high {monthLabel(lifetime.householdHigh)} {fmtEUR(lifetime.householdHigh.amountEUR)}
              </span>
            </div>
          )}
        </div>
        {/* Owner 2026-07-27: the old "Credit card bills" panel confused —
            it is simply the card PAYMENTS booked this month. Reframed as a
            small hero tile. */}
        <div className="hero-cell">
          <div className="kicker">Card payments this month</div>
          <div className="hero-value num">
            <Money amountEUR={cardTotal} tabular />
          </div>
          <div className="hero-note num">
            {cardRows.length === 0 ? 'no card payments booked yet' : cardRows.map((r) => `${r.label} ${fmtEUR(r.amountEUR)}`).join(' · ')}
          </div>
        </div>
        {/* Debt / Credit (owner 2026-07-27, hoisted to the hero band same
            day): net position after savings and expected income cover the
            upcoming expenses. */}
        <div className="hero-cell" data-tone={netDebt > 0 ? 'bad' : 'good'}>
          <div className="kicker">{netDebt > 0 ? 'Net debt' : 'Net credit'}</div>
          <div className="hero-value num" style={{ color: netDebt > 0 ? 'var(--red)' : 'var(--green)' }}>
            <Money amountEUR={Math.abs(netDebt)} tabular />
          </div>
          <div className="hero-note num">
            {fmtEUR(toPayTotal)} upcoming − {fmtEUR(bankTotal)} savings − {fmtEUR(expectedTotal)} expected
          </div>
        </div>
      </div>

      <div className="overview-grid">
      {/* Column 1 (LHS, owner request spec §6): Income sources + Savings
          progress — this col-stack rendered after the category panel before
          2026-07-27; markup unchanged, order swapped. */}
      <div className="col-stack">
        <div className="panel2" data-tint="green">
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
                      aria-expanded={isOpen}
                      onClick={() => setOpenIncome((p) => ({ ...p, [g.name]: !p[g.name] }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          setOpenIncome((p) => ({ ...p, [g.name]: !p[g.name] }))
                        }
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

        {/* Upcoming income (owner 2026-07-27, moved below Income sources
            same day): expected inflows — Salary, KG/EG, money owed to him
            (Sachin, Cris, …) — read from the K/L forecast block the owner
            curates in the sheet. */}
        <div className="panel2" data-tint="green">
          <div className="panel2-head">
            <span>Upcoming income</span>
            <span className="panel2-meta">{expectedIncome ? `${expectedIncome.items.length} sources` : 'no forecast block'}</span>
          </div>
          {expectedIncome == null ? (
            <EmptyState message="No K/L forecast block found in this month's tab." />
          ) : expectedIncome.items.length === 0 ? (
            <EmptyState message="Nothing expected right now — fill the forecast rows (Salary, KG+EG, Sachin…) in the sheet." />
          ) : (
            <>
              {expectedIncome.items.map((item, idx) => (
                <div className="dg-row" style={{ gridTemplateColumns: BANK_COLS }} key={`${item.label}-${idx}`}>
                  <span>{item.label}</span>
                  <span className="right">
                    <Money amountEUR={item.amountEUR} tabular />
                  </span>
                </div>
              ))}
              <div className="dg-foot" style={{ gridTemplateColumns: BANK_COLS }}>
                <span>Total expected</span>
                <span className="right">
                  <Money amountEUR={expectedIncome.total} tabular />
                </span>
              </div>
            </>
          )}
        </div>

        <div className="panel2" data-tint="blue">
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
                    <span className="num month-label">{p.label}</span>
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
                <span className="month-label">Saved (6 mo)</span>
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

      {/* Column 2: Expenses by category */}
      <div className="panel2" data-tint="red">
        <div className="panel2-head">
          <span>Expenses by category</span>
          <span className="panel2-meta">
            {categoryRows.length} categories{budgetCoverageNote ? ` · ${budgetCoverageNote}` : ''}
          </span>
        </div>
        {driftNote && (
          <div className="dg-note" style={{ color: 'var(--amber)' }}>
            {driftNote}
          </div>
        )}
        {categoryRows.length === 0 ? (
          <EmptyState message="No expenses recorded." />
        ) : (
          <>
            <div className="dg-cols" style={{ gridTemplateColumns: CAT_COLS }}>
              <span className="dot-spacer" />
              <span>Category</span>
              <span className="right">Items</span>
              <span>Share</span>
              <span className="right">Actual</span>
              <span className="right">Budget</span>
              <span className="right">Var</span>
            </div>
            {categoryRows.map((row) => {
              const color = categoryColor(row.category, palette)
              const sharePct = totalExpense > 0 ? (row.total / totalExpense) * 100 : 0
              const varianceColor = row.variance == null ? undefined : row.variance >= 0 ? 'var(--green)' : 'var(--red)'
              const isOpen = expandedCategory === row.category
              const sortedItems = [...row.items].sort((a, b) => compareAmountDesc(a.amountEUR, b.amountEUR))
              return (
                <div key={row.category}>
                  <div
                    className="dg-row clickable"
                    style={{ gridTemplateColumns: CAT_COLS }}
                    role="button"
                    tabIndex={0}
                    aria-expanded={isOpen}
                    onClick={() => setExpandedCategory(isOpen ? null : row.category)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setExpandedCategory(isOpen ? null : row.category)
                      }
                    }}
                  >
                    <span className="dot" style={{ background: color }} />
                    <span className="cat-label">{row.category}</span>
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
              <span className="dot-spacer" />
              <span>Total</span>
              <span className="right">{selectedMonth.expenses.length}</span>
              <span />
              <span className="right">
                <Money amountEUR={totalExpense} tabular />
              </span>
              <span className="right">{footerBudget == null ? '—' : <Money amountEUR={footerBudget} tabular />}</span>
              <span
                className="right"
                style={{ color: footerVariance == null ? undefined : footerVariance >= 0 ? 'var(--green)' : 'var(--red)' }}
              >
                {footerVariance == null ? '—' : <Money amountEUR={footerVariance} tabular />}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Column 3: Bank accounts + Upcoming to pay */}
      <div className="col-stack">
        <div className="panel2" data-tint="green">
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

        <div className="panel2" data-tint="amber" data-tone={coverage < 0 ? 'bad' : undefined}>
          <div className="panel2-head">
            <span>Upcoming to pay</span>
            <span className="panel2-meta">{bills.length} bills</span>
          </div>
          {coverageNote && <div className="dg-note">{coverageNote}</div>}
          {providerGroups.length === 0 && foodHomeRemaining == null && !showDues ? (
            <EmptyState message="Nothing upcoming." />
          ) : (
            <>
              {/* Card & person dues (spec §3/§6): computed rows, not the
                  sheet's M/N/O figures. Rows with a missing input show an
                  em-dash and name the missing piece in their note. The
                  whole sub-block is suppressed for months with no scratch
                  data at all (pre-Nov-2024 tabs) — four all-dash rows there
                  are noise, not information (reviewer, 2026-07-27). */}
              {showDues && (
                <>
                  <div className="dg-cols" style={{ gridTemplateColumns: DUES_COLS }}>
                    <span>Card &amp; person dues</span>
                    <span className="right">Due</span>
                  </div>
                  {dues.map((d) => (
                    <div className="dg-row" style={{ gridTemplateColumns: DUES_COLS }} key={d.key}>
                      <span className="dues-label">
                        {d.label}
                        <span className="dues-note num">{d.note}</span>
                      </span>
                      <span className="right" style={{ color: d.due != null && d.due < 0 ? 'var(--green)' : undefined }}>
                        <Money amountEUR={d.due} tabular />
                      </span>
                    </div>
                  ))}
                  <div className="dg-cols" style={{ gridTemplateColumns: UPCOMING_COLS }}>
                    <span>Other upcoming</span>
                    <span className="right">Items</span>
                    <span className="right">To pay</span>
                  </div>
                </>
              )}
              {providerGroups.map((g) => {
                const isOpen = !!openUpcoming[g.name]
                return (
                  <div key={g.name}>
                    <div
                      className="dg-row clickable"
                      style={{ gridTemplateColumns: UPCOMING_COLS }}
                      role="button"
                      tabIndex={0}
                      aria-expanded={isOpen}
                      onClick={() => setOpenUpcoming((p) => ({ ...p, [g.name]: !p[g.name] }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          setOpenUpcoming((p) => ({ ...p, [g.name]: !p[g.name] }))
                        }
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
                <span>{showDues ? 'Total to pay (dues + bills)' : 'Total to pay'}</span>
                <span />
                <span className="right">
                  <Money amountEUR={toPayTotal} tabular />
                </span>
              </div>
            </>
          )}
        </div>

      </div>
      </div>
    </div>
  )
}
