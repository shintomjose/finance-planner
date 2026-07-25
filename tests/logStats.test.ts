import { describe, it, expect } from 'vitest'
import { alcoholTotal, gearTotals, gymStats, petrolStats } from '../src/lib/logStats'
import type { LogEntry } from '../src/types'

const petrol = (date: string | null, litres: number | null, amountEUR: number | null, perLitre: number | null, km: number | null): LogEntry => ({
  log: 'petrol', date, fields: { litres, amountEUR, perLitre, km },
})
const gym = (date: string | null, amountEUR: number | null): LogEntry => ({ log: 'gym', date, fields: { amountEUR } })
const gearEUR = (date: string | null, amountEUR: number | null): LogEntry => ({ log: 'gear', date, fields: { amountEUR } })
const gearINR = (date: string | null, amountINR: number | null, item?: string): LogEntry => ({
  log: 'gear', date, fields: { amountINR, item: item ?? null },
})
const alcohol = (date: string | null, amountEUR: number | null): LogEntry => ({ log: 'alcohol', date, fields: { amountEUR } })

describe('petrolStats', () => {
  it('empty logs -> all zeros/nulls, no series', () => {
    expect(petrolStats([])).toEqual({
      fills: 0, totalLitres: 0, totalEUR: 0, avgPerLitre: null, series: [], consumptionL100km: null,
    })
  })

  it('ignores non-petrol log entries', () => {
    const logs = [gym('2026-01-01', 10), petrol('2026-01-01', 10, 17.5, 1.75, null)]
    expect(petrolStats(logs).fills).toBe(1)
  })

  it('sums litres/EUR and computes a weighted avgPerLitre (totalEUR/totalLitres)', () => {
    const logs = [
      petrol('2026-01-10', 40, 70, 1.75, null),
      petrol('2026-02-10', 20, 37, 1.85, null),
    ]
    const stats = petrolStats(logs)
    expect(stats.fills).toBe(2)
    expect(stats.totalLitres).toBe(60)
    expect(stats.totalEUR).toBe(107)
    expect(stats.avgPerLitre).toBeCloseTo(107 / 60, 2)
  })

  it('series carries only fills with both a date and a perLitre reading, sorted chronologically', () => {
    const logs = [
      petrol('2026-03-01', 10, 17.5, 1.75, null),
      petrol('2026-01-01', 10, 17.0, 1.70, null),
      petrol(null, 10, 17.0, 1.70, null), // no date -> excluded
      petrol('2026-02-01', 10, null, null, null), // no perLitre -> excluded
    ]
    const stats = petrolStats(logs)
    expect(stats.series).toEqual([
      { date: '2026-01-01', perLitre: 1.70 },
      { date: '2026-03-01', perLitre: 1.75 },
    ])
  })

  it('consumptionL100km is null with fewer than 2 km-bearing fills', () => {
    const logs = [petrol('2026-01-01', 40, 70, 1.75, 15000), petrol('2026-02-01', 40, 70, 1.75, null)]
    expect(petrolStats(logs).consumptionL100km).toBeNull()
  })

  it('consumptionL100km sums litres of every km-bearing fill AFTER the first (baseline) reading, over the distance covered', () => {
    // baseline fill at km 15000 (its own litres excluded); second fill at
    // 15400 (+400km, 32L counted); third fill at 15800 (+400km more, 30L
    // counted) -> total 62L over 800km -> 7.75 L/100km
    const logs = [
      petrol('2026-01-01', 40, 70, 1.75, 15000),
      petrol('2026-01-15', 32, 56, 1.75, 15400),
      petrol('2026-02-01', 30, 52.5, 1.75, 15800),
    ]
    expect(petrolStats(logs).consumptionL100km).toBeCloseTo(7.75, 5)
  })

  it('consumptionL100km is null when the odometer does not advance (non-positive distance)', () => {
    const logs = [petrol('2026-01-01', 40, 70, 1.75, 15000), petrol('2026-01-15', 30, 52.5, 1.75, 15000)]
    expect(petrolStats(logs).consumptionL100km).toBeNull()
  })
})

describe('gymStats', () => {
  it('empty logs -> all zeros/nulls', () => {
    expect(gymStats([])).toEqual({ visits: 0, totalEUR: 0, avgPerVisit: null, monthlySeries: [], perVisitSeries: [] })
  })

  it('ignores non-gym entries and sums visits/EUR', () => {
    const logs = [gym('2026-01-05', 25), gym('2026-01-20', 25), petrol('2026-01-01', 10, 17.5, 1.75, null)]
    const stats = gymStats(logs)
    expect(stats.visits).toBe(2)
    expect(stats.totalEUR).toBe(50)
    expect(stats.avgPerVisit).toBe(25)
  })

  it('perVisitSeries carries every dated visit with a non-null amount, chronologically sorted (cost trend, not frequency)', () => {
    const logs = [
      gym('2026-02-01', 30),
      gym('2026-01-05', 25),
      gym(null, 25), // no date -> excluded
      gym('2026-01-20', null), // no amount -> excluded
    ]
    expect(gymStats(logs).perVisitSeries).toEqual([
      { date: '2026-01-05', amountEUR: 25 },
      { date: '2026-02-01', amountEUR: 30 },
    ])
  })

  it('monthlySeries groups by YYYY-MM, chronologically sorted, dateless visits excluded', () => {
    const logs = [gym('2026-02-01', 25), gym('2026-01-05', 25), gym('2026-01-20', 25), gym(null, 25)]
    expect(gymStats(logs).monthlySeries).toEqual([
      { month: '2026-01', visits: 2 },
      { month: '2026-02', visits: 1 },
    ])
  })
})

describe('gearTotals', () => {
  it('empty logs -> zeros', () => {
    expect(gearTotals([])).toEqual({ totalEUR: 0, totalINR: 0 })
  })

  it('sums EUR and INR gear entries independently, ignoring other log kinds', () => {
    const logs = [gearEUR('2026-01-01', 40), gearINR('2026-01-02', 2000, 'Racket'), gym('2026-01-01', 25)]
    expect(gearTotals(logs)).toEqual({ totalEUR: 40, totalINR: 2000 })
  })
})

describe('alcoholTotal', () => {
  it('empty logs -> zero total, zero entries', () => {
    expect(alcoholTotal([])).toEqual({ totalEUR: 0, entries: 0 })
  })

  it('sums EUR and counts entries, ignoring other log kinds', () => {
    const logs = [alcohol('2026-01-01', 12), alcohol('2026-01-08', 8), gym('2026-01-01', 25)]
    expect(alcoholTotal(logs)).toEqual({ totalEUR: 20, entries: 2 })
  })
})
