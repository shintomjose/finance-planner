// Pure log-block statistics (Plan 2 Task 12): petrol/gym/gear/alcohol
// aggregates derived from MonthlyPlanData.logs (LogEntry[], produced by
// ../parse/monthlyPlan). No I/O — every function here is a straight
// aggregate over already-parsed entries, same "screen only shapes data,
// math lives in lib/" split as budgetActuals.ts/trends.ts/networth.ts.
import type { LogEntry } from '../types'
import { round2 } from './mathUtils'

export interface PetrolStats {
  fills: number
  totalLitres: number
  totalEUR: number
  avgPerLitre: number | null
  series: { date: string; perLitre: number }[]
  consumptionL100km: number | null
}

export interface GymStats {
  visits: number
  totalEUR: number
  avgPerVisit: number | null
  monthlySeries: { month: string; visits: number }[]
}

/** LogEntry.fields values are `number | string | null` (a shared shape
 * across all four log kinds, since e.g. gear carries a string `item`
 * field alongside its numeric amount) — this narrows to a finite number
 * or null, treating a string/NaN field as absent rather than coercing it. */
function num(v: number | string | null | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function byLog(logs: LogEntry[], kind: LogEntry['log']): LogEntry[] {
  return logs.filter((l) => l.log === kind)
}

/**
 * Petrol fill stats (fields: litres, amountEUR, perLitre, km — all
 * number|null per the parser).
 *
 * `avgPerLitre` is the WEIGHTED average (totalEUR / totalLitres), not a
 * plain mean of each fill's own `perLitre` reading — a mean would
 * overweight small fills relative to large ones; dividing pooled spend by
 * pooled litres is the number that actually matches "what did fuel cost
 * per litre over this period".
 *
 * `series` is every fill carrying BOTH a date and a `perLitre` reading,
 * sorted chronologically (dates are ISO 'YYYY-MM-DD' strings, so a plain
 * string sort is already a correct date sort) — a fill missing either
 * field is dropped rather than charted at a wrong/zero x or y.
 *
 * `consumptionL100km` needs at least 2 fills with a known odometer (`km`)
 * reading. Fills are ordered chronologically first, falling back to their
 * original position in `logs` when dates are missing/tied (the same
 * "sheet row order is the tiebreak" convention used elsewhere in this
 * codebase). The EARLIEST km-bearing fill is treated as a baseline
 * odometer reading only — its own litres are excluded from the
 * consumption sum, because those litres brought the tank to whatever
 * state it was in AT that reading; they weren't consumed to reach it.
 * Every km-bearing fill AFTER the baseline contributes its litres to the
 * sum, which is then divided by the total distance covered (last km −
 * first km) and scaled to L/100km. Fewer than 2 km-bearing fills, or a
 * non-positive distance (odometer didn't advance, or the km values are
 * out of order/duplicated), yields null rather than a division artifact.
 */
export function petrolStats(logs: LogEntry[]): PetrolStats {
  const petrol = byLog(logs, 'petrol')

  const totalLitres = round2(petrol.reduce((sum, p) => sum + (num(p.fields.litres) ?? 0), 0))
  const totalEUR = round2(petrol.reduce((sum, p) => sum + (num(p.fields.amountEUR) ?? 0), 0))
  const avgPerLitre = totalLitres > 0 ? round2(totalEUR / totalLitres) : null

  const series = petrol
    .filter((p): p is LogEntry & { date: string } => p.date != null && num(p.fields.perLitre) != null)
    .map((p) => ({ date: p.date, perLitre: num(p.fields.perLitre) as number }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))

  const withKm = petrol
    .map((p, i) => ({ km: num(p.fields.km), litres: num(p.fields.litres) ?? 0, date: p.date, order: i }))
    .filter((p): p is { km: number; litres: number; date: string | null; order: number } => p.km != null)
    .sort((a, b) => {
      if (a.date != null && b.date != null && a.date !== b.date) return a.date < b.date ? -1 : 1
      if ((a.date != null) !== (b.date != null)) return a.date != null ? -1 : 1
      return a.order - b.order
    })

  let consumptionL100km: number | null = null
  if (withKm.length >= 2) {
    const distanceKm = withKm[withKm.length - 1].km - withKm[0].km
    const litresConsumed = withKm.slice(1).reduce((sum, p) => sum + p.litres, 0)
    consumptionL100km = distanceKm > 0 ? round2((litresConsumed / distanceKm) * 100) : null
  }

  return { fills: petrol.length, totalLitres, totalEUR, avgPerLitre, series, consumptionL100km }
}

/**
 * Gym visit stats. `monthlySeries` groups visits by calendar month
 * (`date.slice(0, 7)`, ISO 'YYYY-MM' — safe since dates are always
 * full ISO strings when present), chronologically sorted; a visit with no
 * date can't be placed on the series so it's excluded from it (it still
 * counts toward `visits`/`totalEUR`/`avgPerVisit`, which don't need a date).
 */
export function gymStats(logs: LogEntry[]): GymStats {
  const gym = byLog(logs, 'gym')
  const visits = gym.length
  const totalEUR = round2(gym.reduce((sum, g) => sum + (num(g.fields.amountEUR) ?? 0), 0))
  const avgPerVisit = visits > 0 ? round2(totalEUR / visits) : null

  const byMonth = new Map<string, number>()
  for (const g of gym) {
    if (g.date == null) continue
    const month = g.date.slice(0, 7)
    byMonth.set(month, (byMonth.get(month) ?? 0) + 1)
  }
  const monthlySeries = [...byMonth.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([month, visits]) => ({ month, visits }))

  return { visits, totalEUR, avgPerVisit, monthlySeries }
}

/** Gear entries split across two independent parser blocks (EUR-only and
 * INR-only, monthlyPlan.ts's parseGearEURBlock/parseGearINRBlock) that
 * both emit `log: 'gear'` — a single entry only ever carries ONE of
 * amountEUR/amountINR, never both, so the two sums here are independent
 * totals of disjoint entries, not two views of the same figure (no
 * fxRate conversion between them). */
export function gearTotals(logs: LogEntry[]): { totalEUR: number; totalINR: number } {
  const gear = byLog(logs, 'gear')
  const totalEUR = round2(gear.reduce((sum, g) => sum + (num(g.fields.amountEUR) ?? 0), 0))
  const totalINR = round2(gear.reduce((sum, g) => sum + (num(g.fields.amountINR) ?? 0), 0))
  return { totalEUR, totalINR }
}

export function alcoholTotal(logs: LogEntry[]): { totalEUR: number; entries: number } {
  const alcohol = byLog(logs, 'alcohol')
  const totalEUR = round2(alcohol.reduce((sum, a) => sum + (num(a.fields.amountEUR) ?? 0), 0))
  return { totalEUR, entries: alcohol.length }
}
