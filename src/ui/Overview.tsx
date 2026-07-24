// Overview tab: current-month summary cards + upcoming-to-pay list.
// Falls back to the latest available month when the current-month tab is
// missing from the spreadsheet (orchestrator already records that as a
// 'missing-current-month' issue — this just needs to render something sane).
import { currentTabName } from '../lib/period'
import type { MonthData } from '../types'

const fmt = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })

function fmtOrDash(v: number | null | undefined): string {
  return v == null ? '–' : fmt.format(v)
}

function Card({ label, v }: { label: string; v: number | null | undefined }) {
  return (
    <div className="card">
      <div className="card-label">{label}</div>
      <div className="card-value">{fmtOrDash(v)}</div>
    </div>
  )
}

export function Overview({ months, now }: { months: MonthData[]; now: Date }) {
  const currentTab = currentTabName(now)
  const cur = months.find((m) => m.tab === currentTab) ?? months.at(-1)
  if (!cur) return <p>No data.</p>

  const income = cur.income.reduce((s, t) => s + (t.amountEUR ?? 0), 0)
  const expense = cur.expenses.reduce((s, t) => s + (t.amountEUR ?? 0), 0)
  const upcoming = cur.upcoming.filter((u) => (u.toPay ?? 0) > 0)

  return (
    <section>
      <h2>
        {cur.tab}
        {cur.tab !== currentTab && ' (latest — current month tab missing)'}
      </h2>
      <div className="cards">
        <Card label="Income" v={income} />
        <Card label="Expense" v={expense} />
        <Card label="Balance" v={income - expense + (cur.carryover ?? 0)} />
        <Card label="Bank total" v={cur.bankTotal} />
      </div>
      <h3>Upcoming to pay</h3>
      {upcoming.length === 0 ? (
        <p>Nothing upcoming.</p>
      ) : (
        <ul>
          {upcoming.map((u) => (
            <li key={u.name}>
              {u.name}: {fmtOrDash(u.toPay)}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
