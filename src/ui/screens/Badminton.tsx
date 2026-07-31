// Badminton screen (spec 2026-07-27 §7): the owner's badminton gear spend,
// sourced EXCLUSIVELY from the MONTHLY_PLAN badminton gear € block
// (plan.logs entries with log === 'gear' carrying amountEUR — F30:G64;
// owner picked this source explicitly over month-ledger label matching).
// The ₹ (India) block panel was dropped 2026-07-31 on owner request. The
// sheet block carries no dates at all (parse/monthlyPlan.ts) — if a date
// column is ever added to the sheet, plumb it through LogEntry.date and
// render it here.
import type { MonthlyPlanData } from '../../parse/monthlyPlan'
import type { LogEntry } from '../../types'
import { round2 } from '../../lib/mathUtils'
import { BarMeter, EmptyState, Money } from '../shared'

const EUR_COLS = '28px 1fr minmax(120px, 200px) 64px 110px'

interface GearItem { label: string; amount: number }

/** € gear items from the mixed gear log, largest first. Rows whose amount
 * failed to parse (null — already a Parser Health issue) are dropped from
 * the figures; ₹ rows are ignored entirely (panel removed). */
function gearEUR(logs: LogEntry[]): GearItem[] {
  const eur: GearItem[] = []
  for (const entry of logs) {
    if (entry.log !== 'gear') continue
    const label = typeof entry.fields.label === 'string' ? entry.fields.label : null
    if (!label) continue
    if (typeof entry.fields.amountEUR === 'number') {
      eur.push({ label, amount: entry.fields.amountEUR })
    }
  }
  eur.sort((a, b) => b.amount - a.amount)
  return eur
}

export function Badminton({ plan }: { plan: MonthlyPlanData | null }) {
  if (!plan) {
    return <EmptyState title="Badminton" message="MONTHLY_PLAN tab unavailable — no gear data to show." />
  }

  const eur = gearEUR(plan.logs)
  const eurTotal = round2(eur.reduce((s, i) => s + i.amount, 0))
  const maxEur = Math.max(1, ...eur.map((i) => i.amount))

  return (
    <div className="badminton-grid">
      <div className="panel2">
        <div className="panel2-head">
          <span>Gear spend €</span>
          <span className="panel2-meta">{eur.length} items · <Money amountEUR={eurTotal} tabular /></span>
        </div>
        {eur.length === 0 ? (
          <EmptyState message="No € gear entries recorded." />
        ) : (
          <>
            <div className="dg-cols" style={{ gridTemplateColumns: EUR_COLS }}>
              <span>#</span>
              <span>Item</span>
              <span>Share</span>
              <span className="right">%</span>
              <span className="right">Amount</span>
            </div>
            {eur.map((item, idx) => (
              <div className="dg-row gear-row" style={{ gridTemplateColumns: EUR_COLS }} key={`${item.label}-${idx}`}>
                <span className="gear-rank">{idx + 1}</span>
                <span className="gear-item">{item.label}</span>
                <BarMeter pct={(item.amount / maxEur) * 100} />
                <span className="right gear-pct num">{eurTotal > 0 ? `${Math.round((item.amount / eurTotal) * 100)}%` : '—'}</span>
                <span className="right">
                  <Money amountEUR={item.amount} tabular />
                </span>
              </div>
            ))}
            <div className="dg-foot" style={{ gridTemplateColumns: EUR_COLS }}>
              <span />
              <span>Total</span>
              <span />
              <span />
              <span className="right">
                <Money amountEUR={eurTotal} tabular />
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
