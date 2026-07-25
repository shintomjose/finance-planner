// Budget vs Actual screen (Plan 2 Task 9): MONTHLY_PLAN's budget rows
// against the selected month's categorized actuals. All the matching/pacing
// math lives in ../../lib/budgetActuals — this component only picks the
// selected month and renders the resulting BudgetView. No recharts import
// here (PacingBar is pure CSS), so this stays a cheap lazy chunk.
import { useMemo, useState } from 'react'
import { budgetActuals } from '../../lib/budgetActuals'
import { pickDisplayedMonth } from '../../lib/period'
import type { MonthlyPlanData } from '../../parse/monthlyPlan'
import type { AppState } from '../../state/appState'
import type { MonthData } from '../../types'
import { PacingBar } from '../charts/PacingBar'
import { EmptyState, Money, Section, StatCard } from '../shared'

export interface BudgetScreenProps {
  months: MonthData[]
  plan: MonthlyPlanData | null
  state: AppState
  now: Date
}

const eurFmt = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
const fmtEUR = (v: number) => (Number.isFinite(v) ? eurFmt.format(v) : eurFmt.format(0))
const fmtPct = (v: number) => (Number.isFinite(v) ? `${Math.round(v)}%` : '∞%')

export function Budget({ months, plan, state, now }: BudgetScreenProps) {
  const defaultTab = useMemo(() => pickDisplayedMonth(months, now)?.tab, [months, now])
  const [selectedTab, setSelectedTab] = useState<string | undefined>(defaultTab)

  if (!plan) {
    return (
      <EmptyState
        title="Budget"
        message="No MONTHLY_PLAN data connected yet — the budget plan will appear here once it's wired up."
      />
    )
  }

  const activeTab = selectedTab ?? defaultTab
  const selectedMonth = months.find((m) => m.tab === activeTab)
  const view = budgetActuals(selectedMonth, plan.budget, state.categoryOverrides, now, plan.budgetTotals.surplus)

  return (
    <div className="budget-screen">
      <Section
        title="Budget vs Actual"
        actions={
          months.length > 0 && (
            <select
              className="budget-month-select"
              value={activeTab ?? ''}
              onChange={(e) => setSelectedTab(e.target.value)}
              aria-label="Month"
            >
              {months.map((m) => (
                <option key={m.tab} value={m.tab}>
                  {m.tab}
                </option>
              ))}
            </select>
          )
        }
      >
        <div className="stat-grid">
          <StatCard label="Planned" value={<Money amountEUR={view.totals.planned} />} />
          <StatCard label="Actual" value={<Money amountEUR={view.totals.actual} />} />
          <StatCard
            label="Surplus"
            value={<Money amountEUR={view.totals.surplus} />}
            tone={view.totals.surplus >= 0 ? 'good' : 'bad'}
            sub={view.totals.plannedSurplus != null ? <>Planned: {fmtEUR(view.totals.plannedSurplus)}</> : undefined}
          />
        </div>
      </Section>

      {!selectedMonth ? (
        <EmptyState message="No data for this month yet — showing planned budget only." />
      ) : (
        <Section title="Categories">
          {view.rows.length === 0 ? (
            <EmptyState message="No budget categories found in MONTHLY_PLAN." />
          ) : (
            <div className="budget-rows">
              {view.rows.map((row) => (
                <div className="budget-row" key={row.category}>
                  <PacingBar label={row.category} plannedEUR={row.plannedMonthly} spentEUR={row.actual} formatValue={fmtEUR} />
                  <div className="budget-row-meta">
                    <span>{fmtPct(row.pctOfMonth)} of month</span>
                    {row.over && <span className="budget-row-flag">Over budget</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>
      )}

      <Section title="Unbudgeted spending">
        {view.unbudgeted.length === 0 ? (
          <EmptyState message="Nothing spent outside the budgeted categories." />
        ) : (
          <ul className="upcoming-list">
            {view.unbudgeted.map((u) => (
              <li key={u.category}>
                <span className="upcoming-name">{u.category}</span>
                <Money amountEUR={u.actual} tabular />
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}
