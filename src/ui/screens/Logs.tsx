// Logs screen (Plan 2 Task 12): tabbed petrol/gym/gear/alcohol log views,
// all sourced from MonthlyPlanData.logs (a single flat LogEntry[] covering
// all four kinds — monthlyPlan.ts). All the aggregation math lives in
// ../../lib/logStats; this component only picks a tab and shapes chart data.
import { useState } from 'react'
import { alcoholTotal, gearTotals, gymStats, petrolStats } from '../../lib/logStats'
import type { MonthlyPlanData } from '../../parse/monthlyPlan'
import type { LogEntry } from '../../types'
import { CategoryLine } from '../charts/CategoryLine'
import { MonthBar } from '../charts/MonthBar'
import { EmptyState, Money, Section, StatCard } from '../shared'

export interface LogsScreenProps {
  plan: MonthlyPlanData | null
}

type LogTab = 'petrol' | 'gym' | 'gear' | 'alcohol'
const TABS: { id: LogTab; label: string }[] = [
  { id: 'petrol', label: 'Petrol' },
  { id: 'gym', label: 'Gym' },
  { id: 'gear', label: 'Gear' },
  { id: 'alcohol', label: 'Alcohol' },
]

const fmtPerLitre = (v: number) => `€${v.toFixed(2)}/L`
const fmtEURPerVisit = (v: number) => `€${v.toFixed(2)}`
const fmtVisits = (v: number) => `${v}`
const fmtNum = (v: number | string | null) => (typeof v === 'number' ? String(v) : '–')

function PetrolPanel({ logs }: { logs: LogEntry[] }) {
  const stats = petrolStats(logs)
  const entries = logs.filter((l) => l.log === 'petrol')

  if (stats.fills === 0) return <EmptyState message="No petrol fills logged." />

  return (
    <>
      <div className="stat-grid">
        <StatCard label="Fills" value={stats.fills} />
        <StatCard label="Litres" value={`${stats.totalLitres} L`} />
        <StatCard label="Total" value={<Money amountEUR={stats.totalEUR} tabular />} />
        <StatCard label="Avg €/L" value={stats.avgPerLitre == null ? '–' : `€${stats.avgPerLitre.toFixed(2)}`} />
        <StatCard
          label="Consumption"
          value={stats.consumptionL100km == null ? '–' : `${stats.consumptionL100km} L/100km`}
          sub={stats.consumptionL100km == null ? 'Needs 2+ fills with a recorded odometer reading' : undefined}
        />
      </div>

      {stats.series.length >= 2 ? (
        <CategoryLine data={stats.series} xKey="date" series={[{ key: 'perLitre', label: '€/L' }]} valueFormatter={fmtPerLitre} />
      ) : (
        <EmptyState message="Not enough dated fills to chart a €/L trend." />
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Litres</th>
              <th>Amount</th>
              <th>€/L</th>
              <th>Km</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => (
              <tr key={i}>
                <td>{e.date ?? '–'}</td>
                <td>{fmtNum(e.fields.litres)}</td>
                <td>
                  <Money amountEUR={typeof e.fields.amountEUR === 'number' ? e.fields.amountEUR : null} tabular />
                </td>
                <td>{typeof e.fields.perLitre === 'number' ? `€${e.fields.perLitre.toFixed(2)}` : '–'}</td>
                <td>{fmtNum(e.fields.km)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function GymPanel({ logs }: { logs: LogEntry[] }) {
  const stats = gymStats(logs)
  if (stats.visits === 0) return <EmptyState message="No gym visits logged." />

  return (
    <>
      <div className="stat-grid">
        <StatCard label="Visits" value={stats.visits} />
        <StatCard label="Total" value={<Money amountEUR={stats.totalEUR} tabular />} />
        <StatCard label="Avg / visit" value={<Money amountEUR={stats.avgPerVisit} tabular />} />
      </div>

      {/* Cost trend (€/visit, one point per visit) — distinct from the
          visits-per-month frequency chart below; both are informative and
          neither substitutes for the other (reviewer finding). */}
      <p className="chart-subtitle">€/visit trend</p>
      {stats.perVisitSeries.length >= 2 ? (
        <CategoryLine
          data={stats.perVisitSeries}
          xKey="date"
          series={[{ key: 'amountEUR', label: '€/visit' }]}
          valueFormatter={fmtEURPerVisit}
        />
      ) : (
        <EmptyState message="Not enough dated visits to chart a €/visit trend." />
      )}

      <p className="chart-subtitle">Visits per month</p>
      {stats.monthlySeries.length > 0 ? (
        <MonthBar data={stats.monthlySeries} xKey="month" series={[{ key: 'visits', label: 'Visits' }]} valueFormatter={fmtVisits} />
      ) : (
        <EmptyState message="No dated visits to chart." />
      )}
    </>
  )
}

function GearPanel({ logs }: { logs: LogEntry[] }) {
  const totals = gearTotals(logs)
  if (totals.totalEUR === 0 && totals.totalINR === 0) return <EmptyState message="No gear purchases logged." />

  return (
    <div className="stat-grid">
      <StatCard label="Total (€)" value={<Money amountEUR={totals.totalEUR} tabular />} />
      <StatCard label="Total (₹)" value={<Money mode="INR" amountINR={totals.totalINR} tabular />} />
    </div>
  )
}

function AlcoholPanel({ logs }: { logs: LogEntry[] }) {
  const totals = alcoholTotal(logs)
  if (totals.entries === 0) return <EmptyState message="No alcohol purchases logged." />

  return (
    <div className="stat-grid">
      <StatCard label="Total" value={<Money amountEUR={totals.totalEUR} tabular />} />
      <StatCard label="Entries" value={totals.entries} />
    </div>
  )
}

export function Logs({ plan }: LogsScreenProps) {
  const [tab, setTab] = useState<LogTab>('petrol')

  if (!plan) {
    return (
      <EmptyState
        title="Logs"
        message="No MONTHLY_PLAN data connected yet — petrol/gym/gear/alcohol logs will appear here once it's wired up."
      />
    )
  }

  const logs = plan.logs

  return (
    <div className="logs-screen">
      <Section
        title="Logs"
        actions={
          <div className="range-toggle" role="group" aria-label="Log">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                className="range-toggle-btn"
                data-active={tab === t.id}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        }
      >
        {tab === 'petrol' && <PetrolPanel logs={logs} />}
        {tab === 'gym' && <GymPanel logs={logs} />}
        {tab === 'gear' && <GearPanel logs={logs} />}
        {tab === 'alcohol' && <AlcoholPanel logs={logs} />}
      </Section>
    </div>
  )
}
