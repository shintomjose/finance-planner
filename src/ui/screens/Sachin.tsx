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

const LEDGER_COLS = '118px 1fr 110px'

/** One side of the Given/Repayments split (owner 2026-07-31): panel with a
 * scrolling row body and a Total footer that stays fixed below the scroll
 * area, so the recomputed total is always visible regardless of scroll
 * position. */
function LedgerPanel({ rows, caption, totalEUR }: { rows: LedgerRow[]; caption: string; totalEUR: number | null }) {
  return (
    <div className="panel2">
      <div className="panel2-head">
        <span>{caption}</span>
        <span className="panel2-meta">{rows.length} entries</span>
      </div>
      {rows.length === 0 ? (
        <EmptyState message={`No ${caption.toLowerCase()} entries.`} />
      ) : (
        <>
          <div className="dg-cols" style={{ gridTemplateColumns: LEDGER_COLS }}>
            <span>Date</span>
            <span>Label</span>
            <span className="right">Amount</span>
          </div>
          <div className="ledger-scroll">
            {newestFirst(rows).map((r) => (
              <div className="dg-row" style={{ gridTemplateColumns: LEDGER_COLS }} key={r.row}>
                <span className="num">{r.date ?? '–'}</span>
                <span>{r.label}</span>
                <span className="right">
                  <Money amountEUR={r.amountEUR} tabular />
                </span>
              </div>
            ))}
          </div>
          <div className="dg-foot" style={{ gridTemplateColumns: LEDGER_COLS }}>
            <span>Total</span>
            <span />
            <span className="right">
              <Money amountEUR={totalEUR} tabular />
            </span>
          </div>
        </>
      )}
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
                      the display is honest even though the prop names aren't.
                      direction="fill" (review fix, Task 13): more confirmed
                      rows is completion, not overspend — the default 'spend'
                      ramp read a fully-confirmed EMI as "critical", which is
                      backwards. */}
                  <PacingBar
                    label={emi.name}
                    plannedEUR={totalRows}
                    spentEUR={confirmedRows}
                    formatValue={installmentFmt}
                    direction="fill"
                  />
                </div>
              )
            })}
          </div>
        )}
      </Section>

      {/* Given / Repayments side by side (owner 2026-07-31); each body
          scrolls independently, totals pinned below the scroll area. */}
      <div className="sachin-ledger-grid">
        <LedgerPanel rows={ledger.entries} caption="Given" totalEUR={given} />
        <LedgerPanel rows={ledger.repayments} caption="Repayments" totalEUR={repaid} />
      </div>
    </div>
  )
}
