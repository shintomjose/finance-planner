// Trips screen (Plan 2 Task 12): one expandable card per INDIA_2023 trip
// block (../../parse/indiaTrips's Trip[]). ₹ figures (totalINR,
// iciciSplitINR) are native rupee amounts from the sheet — never a
// converted EUR value — so they render via Money's `mode="INR"`; the €
// pre-travel total is a plain sum of `entriesEUR`, which has no sheet
// total to cross-check against (indiaTrips.ts: "no equivalent check for
// the € ledger — Trip has no totalEUR field").
import type { Trip } from '../../types'
import { EmptyState, Money, Section } from '../shared'

export interface TripsScreenProps {
  trips: Trip[] | null
}

type TripRow = { date: string | null; label: string; amount: number | null; row: number }

function sumAmounts(rows: TripRow[]): number {
  return rows.reduce((sum, r) => sum + (r.amount ?? 0), 0)
}

function TripLedgerTable({ rows, mode }: { rows: TripRow[]; mode: 'EUR' | 'INR' }) {
  if (rows.length === 0) return <EmptyState message="No entries in this ledger." />
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
          {rows.map((r) => (
            <tr key={r.row}>
              <td>{r.date ?? '–'}</td>
              <td>{r.label}</td>
              <td>
                {mode === 'INR' ? <Money mode="INR" amountINR={r.amount} tabular /> : <Money amountEUR={r.amount} tabular />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TripCard({ trip }: { trip: Trip }) {
  const preTravelEUR = sumAmounts(trip.entriesEUR)
  return (
    <div className="trip-card">
      <div className="trip-card-head">
        <h4 className="trip-card-name">{trip.name}</h4>
        <div className="trip-card-figures">
          <div className="trip-card-figure">
            <span className="trip-card-figure-label">Total</span>
            <Money mode="INR" amountINR={trip.totalINR} tabular />
          </div>
          <div className="trip-card-figure">
            <span className="trip-card-figure-label">Pre-travel (€)</span>
            <Money amountEUR={preTravelEUR} tabular />
          </div>
          <div className="trip-card-figure">
            <span className="trip-card-figure-label">ICICI split</span>
            <Money mode="INR" amountINR={trip.iciciSplitINR} tabular />
          </div>
        </div>
      </div>

      <details className="trip-card-ledger">
        <summary>₹ ledger ({trip.entriesINR.length})</summary>
        <TripLedgerTable rows={trip.entriesINR} mode="INR" />
      </details>

      <details className="trip-card-ledger">
        <summary>€ pre-travel ledger ({trip.entriesEUR.length})</summary>
        <TripLedgerTable rows={trip.entriesEUR} mode="EUR" />
      </details>
    </div>
  )
}

export function Trips({ trips }: TripsScreenProps) {
  if (!trips) {
    return (
      <EmptyState
        title="Trips"
        message="No INDIA_2023 tab data connected yet — trip ledgers will appear here once it's wired up."
      />
    )
  }

  return (
    <div className="trips-screen">
      <Section title="Trips">
        {trips.length === 0 ? (
          <EmptyState message="No trips found in INDIA_2023." />
        ) : (
          <div className="trip-cards">
            {trips.map((trip) => (
              <TripCard trip={trip} key={trip.name} />
            ))}
          </div>
        )}
      </Section>
    </div>
  )
}
