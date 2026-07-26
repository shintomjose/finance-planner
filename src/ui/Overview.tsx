// Overview tab: full current-month view (owner live-review rebuild,
// 2026-07-26). Falls back to the latest available month when the
// current-month tab is missing from the spreadsheet (orchestrator already
// records that as a 'missing-current-month' issue — this just needs to
// render something sane).
//
// Headline income/expense/balance cards are SHEET-PRIMARY (Change 1):
// the sheet's Total Income/Expense/Balance cells are what the user
// compares against when eyeballing the sheet itself, so those are shown
// first, with the app's own recompute as fallback for months where the
// sheet cell is null. All the sheet-vs-recompute math lives in the pure
// ../lib/overviewFigures helper; this component only renders it.
//
// Upcoming's "Food Home" row is a monthly food-budget tracker, not a
// payable bill (Change 2 — see SKILL.md Parser rules / workbook-map.md
// §1.1 Upcoming row): ../lib/foodHome partitions it out of the bills list
// into its own "Food budget remaining" callout.
import { partitionUpcoming } from '../lib/foodHome'
import { overviewFigures } from '../lib/overviewFigures'
import { currentTabName, pickDisplayedMonth } from '../lib/period'
import type { MonthData, Tx } from '../types'
import { EmptyState, Money, Section, StatCard } from './shared'

const eurFmt = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
const fmtEUR = (v: number) => eurFmt.format(v)

function DriftHint({ drift }: { drift: number | null }) {
  if (drift == null) return null
  return (
    <span className="stat-card-drift" title={`Sheet value differs from the app's recomputed figure (${fmtEUR(drift)}) by more than 1 cent.`}>
      {' '}
      ≠ recomputed {fmtEUR(drift)}
    </span>
  )
}

function IncomeRows({ income }: { income: Tx[] }) {
  return (
    <>
      {income.map((tx) => (
        <tr key={`${tx.row}-${tx.label}`}>
          <td>{tx.label}</td>
          <td>
            <Money amountEUR={tx.amountEUR} tabular />
          </td>
        </tr>
      ))}
    </>
  )
}

function ExpenseRows({ expenses }: { expenses: Tx[] }) {
  return (
    <>
      {expenses.map((tx) => (
        <tr key={`${tx.row}-${tx.label}`}>
          <td>
            {tx.label}
            {tx.household && (
              <span className="household-dot" title="Counted in the sheet's Household total" aria-label="household" />
            )}
          </td>
          <td>
            <Money amountEUR={tx.amountEUR} tabular />
          </td>
        </tr>
      ))}
    </>
  )
}

export function Overview({ months, now }: { months: MonthData[]; now: Date }) {
  const currentTab = currentTabName(now)
  const cur = pickDisplayedMonth(months, now)
  if (!cur) return <EmptyState message="No data." />

  const figures = overviewFigures(cur)
  const recomputedExpenseTotal = cur.expenses.reduce((s, t) => s + (t.amountEUR ?? 0), 0)
  const { bills, foodHomeRemaining } = partitionUpcoming(cur.upcoming)
  const payableBills = bills.filter((u) => (u.toPay ?? 0) > 0)
  const billsToPayTotal = payableBills.reduce((s, u) => s + (u.toPay ?? 0), 0)

  return (
    <div className="overview">
      <Section title={cur.tab + (cur.tab !== currentTab ? ' (latest — current month tab missing)' : '')}>
        <div className="stat-grid">
          <StatCard
            label="Total income"
            value={<Money amountEUR={figures.income} />}
            sub={
              <>
                Own {fmtEUR(figures.incomeOwn)} + carryover {fmtEUR(figures.carryover)}
                <DriftHint drift={figures.incomeDrift} />
              </>
            }
          />
          <StatCard
            label="Total expense"
            value={<Money amountEUR={figures.expense} />}
            sub={figures.expenseDrift != null ? <DriftHint drift={figures.expenseDrift} /> : undefined}
          />
          <StatCard
            label="Balance"
            value={<Money amountEUR={figures.balance} />}
            tone={figures.balance >= 0 ? 'good' : 'bad'}
            sub={figures.balanceDrift != null ? <DriftHint drift={figures.balanceDrift} /> : undefined}
          />
          <StatCard label="Bank total" value={<Money amountEUR={cur.bankTotal} />} />
          <StatCard label="Household" value={<Money amountEUR={cur.summary.household} />} />
        </div>
      </Section>

      <Section title="Income">
        {cur.income.length === 0 && figures.carryover === 0 ? (
          <EmptyState message="No income recorded." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Label</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr className="overview-carryover-row">
                  <td>Last Month Balance</td>
                  <td>
                    <Money amountEUR={cur.carryover} tabular />
                  </td>
                </tr>
                <IncomeRows income={cur.income} />
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Expenses">
        {cur.expenses.length === 0 ? (
          <EmptyState message="No expenses recorded." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Label</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                <ExpenseRows expenses={cur.expenses} />
              </tbody>
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td>
                    <Money amountEUR={recomputedExpenseTotal} tabular />
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Section>

      <Section title="Upcoming">
        {foodHomeRemaining != null && (
          <div className="food-home-callout">
            <span className="food-home-callout-label">Food budget remaining</span>
            <Money amountEUR={foodHomeRemaining} tabular />
          </div>
        )}
        {payableBills.length === 0 ? (
          <EmptyState message="Nothing upcoming." />
        ) : (
          <ul className="upcoming-list">
            {payableBills.map((u) => (
              <li key={u.name}>
                <span className="upcoming-name">{u.name}</span>
                <Money amountEUR={u.toPay} tabular />
              </li>
            ))}
            <li className="upcoming-total">
              <span className="upcoming-name">Total to pay</span>
              <Money amountEUR={billsToPayTotal} tabular />
            </li>
          </ul>
        )}
      </Section>
    </div>
  )
}
