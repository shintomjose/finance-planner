// Badminton screen (spec 2026-07-27 §7): the owner's badminton gear spend,
// sourced EXCLUSIVELY from the MONTHLY_PLAN badminton gear blocks
// (plan.logs entries with log === 'gear' — € block F30:G64, ₹ block
// L50:N62; owner picked this source explicitly over month-ledger label
// matching). The blocks carry no dates at all (parse/monthlyPlan.ts), so
// there is no time axis — the "graph" is a per-item BarMeter breakdown of
// the € block, largest first, alongside the ₹ block as a table with an €
// equivalent at the app FX rate.
import type { MonthlyPlanData } from '../../parse/monthlyPlan'
import type { LogEntry } from '../../types'
import { round2 } from '../../lib/mathUtils'
import { BarMeter, EmptyState, Money } from '../shared'

const EUR_COLS = '1fr 140px 96px'
const INR_COLS = '1fr 48px 150px'

interface GearItem { label: string; amount: number; qty?: number }

/** Splits the mixed gear log into its € and ₹ item lists. An entry belongs
 * to whichever amount field it carries; rows whose amount failed to parse
 * (null — already a Parser Health issue) are dropped from the figures. Qty
 * rides on the item itself (not a label-keyed map) so duplicate ₹ labels
 * keep their own quantities. */
function splitGear(logs: LogEntry[]): { eur: GearItem[]; inr: GearItem[] } {
  const eur: GearItem[] = []
  const inr: GearItem[] = []
  for (const entry of logs) {
    if (entry.log !== 'gear') continue
    const label = typeof entry.fields.label === 'string' ? entry.fields.label : null
    if (!label) continue
    if (typeof entry.fields.amountEUR === 'number') {
      eur.push({ label, amount: entry.fields.amountEUR })
    } else if (typeof entry.fields.amountINR === 'number') {
      const item: GearItem = { label, amount: entry.fields.amountINR }
      if (typeof entry.fields.qty === 'number') item.qty = entry.fields.qty
      inr.push(item)
    }
  }
  eur.sort((a, b) => b.amount - a.amount)
  inr.sort((a, b) => b.amount - a.amount)
  return { eur, inr }
}

export function Badminton({ plan, fxRate }: { plan: MonthlyPlanData | null; fxRate: number }) {
  if (!plan) {
    return <EmptyState title="Badminton" message="MONTHLY_PLAN tab unavailable — no gear data to show." />
  }

  const { eur, inr } = splitGear(plan.logs)
  const eurTotal = round2(eur.reduce((s, i) => s + i.amount, 0))
  const inrTotal = round2(inr.reduce((s, i) => s + i.amount, 0))
  const maxEur = Math.max(1, ...eur.map((i) => i.amount))

  return (
    <div className="badminton-grid">
      <div className="panel2">
        <div className="panel2-head">
          <span>Gear spend €</span>
          <span className="panel2-meta">{eur.length} items</span>
        </div>
        {eur.length === 0 ? (
          <EmptyState message="No € gear entries recorded." />
        ) : (
          <>
            <div className="dg-cols" style={{ gridTemplateColumns: EUR_COLS }}>
              <span>Item</span>
              <span>Share</span>
              <span className="right">Amount</span>
            </div>
            {eur.map((item, idx) => (
              <div className="dg-row" style={{ gridTemplateColumns: EUR_COLS }} key={`${item.label}-${idx}`}>
                <span>{item.label}</span>
                <BarMeter pct={(item.amount / maxEur) * 100} />
                <span className="right">
                  <Money amountEUR={item.amount} tabular />
                </span>
              </div>
            ))}
            <div className="dg-foot" style={{ gridTemplateColumns: EUR_COLS }}>
              <span>Total</span>
              <span />
              <span className="right">
                <Money amountEUR={eurTotal} tabular />
              </span>
            </div>
          </>
        )}
      </div>

      <div className="panel2">
        <div className="panel2-head">
          <span>Gear spend ₹ (India)</span>
          <span className="panel2-meta">{inr.length} items</span>
        </div>
        {inr.length === 0 ? (
          <EmptyState message="No ₹ gear entries recorded." />
        ) : (
          <>
            <div className="dg-cols" style={{ gridTemplateColumns: INR_COLS }}>
              <span>Item</span>
              <span className="right">Qty</span>
              <span className="right">Amount</span>
            </div>
            {inr.map((item, idx) => (
              <div className="dg-row" style={{ gridTemplateColumns: INR_COLS }} key={`${item.label}-${idx}`}>
                <span>{item.label}</span>
                <span className="right">{item.qty ?? '—'}</span>
                <span className="right">
                  <Money amountINR={item.amount} mode="INR" fxRate={fxRate} tabular />
                </span>
              </div>
            ))}
            <div className="dg-foot" style={{ gridTemplateColumns: INR_COLS }}>
              <span>Total</span>
              <span />
              <span className="right">
                <Money amountINR={inrTotal} mode="INR" fxRate={fxRate} tabular />
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
