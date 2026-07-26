// Global KPI row (Task 6, template shell): the 7-card headline strip shown
// above the active screen on Overview/Budget/Trends/NetWorth (Layout.tsx
// decides which screens get it). Purely a thin wrapper around buildKpis
// (src/lib/kpis.ts) + KpiCardView (./shared) — all the metric math lives
// in the lib so this stays a one-line-per-card render.
import { buildKpis } from '../lib/kpis'
import type { KpiOptions } from '../lib/kpis'
import type { MonthData } from '../types'
import { KpiCardView } from './shared'

export function KpiRow({
  months,
  selectedTab,
  opts,
}: {
  months: MonthData[]
  selectedTab: string
  opts?: KpiOptions
}) {
  const cards = buildKpis(months, selectedTab, opts)
  return (
    <div className="kpi-grid">
      {cards.map((c) => (
        <KpiCardView key={c.id} card={c} />
      ))}
    </div>
  )
}
