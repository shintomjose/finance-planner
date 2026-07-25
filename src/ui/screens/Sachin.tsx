// Sachin screen (Plan 2 Task 12): given/repaid/remaining totals, the full
// given + repayment ledgers, and per-EMI progress. All figures come
// straight off `ledger` (../../parse/sachin's PersonLedger) — there's no
// separate lib module here because there's no real math beyond what the
// parser already recomputed; this component only sorts/shapes for display.
import type { ParserIssue, PersonLedger } from '../../types'
import { PacingBar } from '../charts/PacingBar'
import { EmptyState, Money, Section, StatCard } from '../shared'

export interface SachinScreenProps {
  sachin: { ledger: PersonLedger } | null
  issues: ParserIssue[]
}

type LedgerRow = { date: string | null; label: string; amountEUR: number | null; row: number }

/** Newest-first: rows with a known date sort descending by date; rows with
 * no date (the ~9 early SACHIN.given rows before the sheet started dating
 * entries, sachin.ts's GIVEN_FIRST_ROW comment) have no chronological
 * position to claim as "newest", so they're kept at the end in their
 * original sheet order instead of being guessed into the date-sorted run. */
function newestFirst(rows: LedgerRow[]): LedgerRow[] {
  const dated = rows.filter((r) => r.date != null).sort((a, b) => (b.date as string).localeCompare(a.date as string))
  const undated = rows.filter((r) => r.date == null)
  return [...dated, ...undated]
}

function LedgerTable({ rows, caption }: { rows: LedgerRow[]; caption: string }) {
  if (rows.length === 0) return <EmptyState message={`No ${caption.toLowerCase()} entries.`} />
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Label</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {newestFirst(rows).map((r) => (
            <tr key={r.row}>
              <td>{r.date ?? '–'}</td>
              <td>{r.label}</td>
              <td>
                <Money amountEUR={r.amountEUR} tabular />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const installmentFmt = (v: number) => `${v} installment${v === 1 ? '' : 's'}`

/**
 * EMI progress: PersonLedger.emis carries no separate "total loan amount"
 * field — the parser only records a row once an installment amount
 * appears in the sheet (sachin.ts's parseEmis walks until the amount
 * column goes blank), so there's no target to measure "money paid" against.
 * What IS derivable: how many of the recorded rows successfully parsed a
 * numeric amount vs. how many rows exist at all (a present-but-unparseable
 * cell, e.g. a stray '#REF!', still counts as a row per the parser's
 * "unparseable-but-present is never silently dropped" rule, but doesn't
 * count as a confirmed installment here). The bar therefore reads as
 * ledger completeness for that EMI, not literal loan payoff progress.
 */
function emiProgress(emi: PersonLedger['emis'][number]) {
  const totalRows = emi.rows.length
  const confirmedRows = emi.rows.filter((r) => r.amountEUR != null).length
  return { totalRows, confirmedRows }
}

export function Sachin({ sachin, issues }: SachinScreenProps) {
  if (!sachin) {
    return (
      <EmptyState
        title="Sachin"
        message="No SACHIN tab data connected yet — the given/repayment ledger will appear here once it's wired up."
      />
    )
  }

  const { ledger } = sachin
  const { given, repaid, remaining } = ledger.totals
  const driftIssues = issues.filter((i) => i.sheet === 'SACHIN' && i.kind === 'sum-drift')

  return (
    <div className="sachin-screen">
      <Section title="Sachin">
        <div className="stat-grid">
          <StatCard label="Given" value={<Money amountEUR={given} tabular />} />
          <StatCard label="Repaid" value={<Money amountEUR={repaid} tabular />} />
          <StatCard label="Remaining" value={<Money amountEUR={remaining} tabular />} />
        </div>
        {driftIssues.length > 0 && (
          <p className="hint">
            {driftIssues.length} sheet total{driftIssues.length === 1 ? '' : 's'} differ slightly from these recomputed
            figures — see Parser Health for details.
          </p>
        )}
      </Section>

      <Section title="EMIs">
        {ledger.emis.length === 0 ? (
          <EmptyState message="No EMI trackers found." />
        ) : (
          <div className="budget-rows">
            {ledger.emis.map((emi) => {
              const { totalRows, confirmedRows } = emiProgress(emi)
              return (
                <div className="budget-row" key={emi.name}>
                  {/* PacingBar's props are named plannedEUR/spentEUR (money), but
                      per emiProgress's doc comment above there's no target loan
                      amount to measure against here — these two are actually
                      ROW COUNTS (total rows / rows with a confirmed amount), not
                      euros. `installmentFmt` renders them as "N installments" so
                      the display is honest even though the prop names aren't. */}
                  <PacingBar label={emi.name} plannedEUR={totalRows} spentEUR={confirmedRows} formatValue={installmentFmt} />
                </div>
              )
            })}
          </div>
        )}
      </Section>

      <Section title="Given">
        <LedgerTable rows={ledger.entries} caption="Given" />
      </Section>

      <Section title="Repayments">
        <LedgerTable rows={ledger.repayments} caption="Repayment" />
      </Section>
    </div>
  )
}
