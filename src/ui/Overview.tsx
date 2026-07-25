// Overview tab: current-month summary cards + upcoming-to-pay list.
// Falls back to the latest available month when the current-month tab is
// missing from the spreadsheet (orchestrator already records that as a
// 'missing-current-month' issue — this just needs to render something sane).
// Visuals only were touched for the Task 8 design-system pass — every
// number below is computed exactly as before.
import { currentTabName, pickDisplayedMonth } from '../lib/period'
import type { MonthData } from '../types'
import { EmptyState, Money, Section, StatCard } from './shared'

export function Overview({ months, now }: { months: MonthData[]; now: Date }) {
  const currentTab = currentTabName(now)
  const cur = pickDisplayedMonth(months, now)
  if (!cur) return <EmptyState message="No data." />

  const income = cur.income.reduce((s, t) => s + (t.amountEUR ?? 0), 0)
  const expense = cur.expenses.reduce((s, t) => s + (t.amountEUR ?? 0), 0)
  const balance = income - expense + (cur.carryover ?? 0)
  const upcoming = cur.upcoming.filter((u) => (u.toPay ?? 0) > 0)

  return (
    <div className="overview">
      <Section title={cur.tab + (cur.tab !== currentTab ? ' (latest — current month tab missing)' : '')}>
        <div className="stat-grid">
          <StatCard label="Income" value={<Money amountEUR={income} />} />
          <StatCard label="Expense" value={<Money amountEUR={expense} />} />
          <StatCard
            label="Balance"
            value={<Money amountEUR={balance} />}
            tone={balance >= 0 ? 'good' : 'bad'}
          />
          <StatCard label="Bank total" value={<Money amountEUR={cur.bankTotal} />} />
        </div>
      </Section>

      <Section title="Upcoming to pay">
        {upcoming.length === 0 ? (
          <EmptyState message="Nothing upcoming." />
        ) : (
          <ul className="upcoming-list">
            {upcoming.map((u) => (
              <li key={u.name}>
                <span className="upcoming-name">{u.name}</span>
                <Money amountEUR={u.toPay} tabular />
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}
