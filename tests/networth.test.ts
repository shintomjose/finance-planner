import { describe, expect, it } from 'vitest'
import { buildNetWorth, project } from '../src/lib/networth'
import type { MonthlyPlanData } from '../src/parse/monthlyPlan'
import type { MutualFundsData } from '../src/parse/mutualFunds'
import type { DeutscheBankData } from '../src/parse/deutscheBank'
import type { BinanceData } from '../src/parse/binance'
import type { InvestmentSnapshot, MonthData } from '../src/types'

const month = (bankTotal: number | null): MonthData => ({
  tab: 'M_1',
  period: { year: 2024, month: 1 },
  era: 'full',
  income: [],
  expenses: [],
  carryover: null,
  summary: { totalIncome: null, totalExpense: null, balance: null, household: null },
  banks: [],
  bankTotal,
  expectedActual: null,
  balanceAfterFuture: null,
  upcoming: [],
  issues: [],
})

const upstocksSnapshot = (overrides: Partial<InvestmentSnapshot> = {}): InvestmentSnapshot => ({
  date: '2024-01-01',
  source: 'upstocks',
  asset: 'Stock X',
  ...overrides,
})

const plan = (upstocks: InvestmentSnapshot[] = [], projection?: Partial<MonthlyPlanData['projection']>): MonthlyPlanData => ({
  budget: [],
  budgetTotals: { income: null, expense: null, surplus: null },
  loan: { principal: null, installments: [], paidToDate: null },
  savingsSnapshots: [],
  projection: { ratePct: null, yearlyContribution: null, rows: [], ...projection },
  sbiLife: [],
  logs: [],
  upstocks,
  issues: [],
})

const mf = (investedINR: number | null, currentINR: number | null, pctChange: number | null = null): MutualFundsData => ({
  snapshots: [],
  summary: { investedINR, currentINR, pctChange },
  issues: [],
})

const db = (valuations: InvestmentSnapshot[], grandTotalEUR: number | null): DeutscheBankData => ({
  products: [],
  payments: [],
  grandTotalEUR,
  valuations,
  productSums: [],
  issues: [],
})

const dbValuation = (date: string | null, valueEUR: number | null): InvestmentSnapshot => ({
  date, source: 'db', asset: 'DEUTSCHE BANK', valueEUR: valueEUR ?? undefined,
})

const binance = (netInEUR: number | null, currentEUR: number | null): BinanceData => ({
  snapshots: [],
  netInEUR,
  currentEUR,
  issues: [],
})

describe('buildNetWorth — per-source aggregation', () => {
  it('bank source pulls latest month bankTotal, invested/pl stay null', () => {
    const view = buildNetWorth(month(5000), null, null, null, null, 100)
    const bank = view.sources.find((s) => s.source === 'bank')
    expect(bank).toEqual({ source: 'bank', label: 'Bank', valueEUR: 5000, investedEUR: null, plEUR: null, plPct: null })
  })

  it('bank source is null when there is no latest month', () => {
    const view = buildNetWorth(undefined, null, null, null, null, 100)
    expect(view.sources.find((s) => s.source === 'bank')?.valueEUR).toBeNull()
  })

  it('db source sums the latest-dated valuation(s) as valueEUR, grandTotalEUR as investedEUR, and derives P/L', () => {
    const data = db(
      [dbValuation('2024-01-01', 1000), dbValuation('2024-06-01', 1200), dbValuation('2024-06-01', 300)],
      1000,
    )
    const view = buildNetWorth(undefined, null, null, data, null, 100)
    const row = view.sources.find((s) => s.source === 'db')
    expect(row?.valueEUR).toBe(1500) // 1200 + 300, both dated 2024-06-01 (the latest date)
    expect(row?.investedEUR).toBe(1000)
    expect(row?.plEUR).toBe(500)
    expect(row?.plPct).toBe(50)
  })

  it('db source is all-null when db is not connected', () => {
    const view = buildNetWorth(undefined, null, null, null, null, 100)
    expect(view.sources.find((s) => s.source === 'db')).toEqual({
      source: 'db', label: 'Deutsche Bank', valueEUR: null, investedEUR: null, plEUR: null, plPct: null,
    })
  })

  it('mf source converts INR summary figures via fxRate (₹ per €) and derives P/L', () => {
    const data = mf(20000, 25000)
    const view = buildNetWorth(undefined, null, data, null, null, 100)
    const row = view.sources.find((s) => s.source === 'mf')
    expect(row?.investedEUR).toBe(200)
    expect(row?.valueEUR).toBe(250)
    expect(row?.plEUR).toBe(50)
    expect(row?.plPct).toBe(25)
  })

  it('mf source is all-null with a non-positive fxRate (guarded), row still present', () => {
    const data = mf(20000, 25000)
    const view = buildNetWorth(undefined, null, data, null, null, 0)
    expect(view.sources.find((s) => s.source === 'mf')).toEqual({
      source: 'mf', label: 'Mutual Funds', valueEUR: null, investedEUR: null, plEUR: null, plPct: null,
    })
  })

  it('mf source is all-null with a non-finite fxRate (guarded)', () => {
    const data = mf(20000, 25000)
    const view = buildNetWorth(undefined, null, data, null, null, NaN)
    expect(view.sources.find((s) => s.source === 'mf')?.valueEUR).toBeNull()
  })

  it('binance source passes EUR figures straight through (no fx conversion) and derives P/L', () => {
    const data = binance(400, 550)
    const view = buildNetWorth(undefined, null, null, null, data, 100)
    const row = view.sources.find((s) => s.source === 'binance')
    expect(row).toEqual({ source: 'binance', label: 'Binance', valueEUR: 550, investedEUR: 400, plEUR: 150, plPct: 37.5 })
  })

  it('upstocks source converts the latest snapshot valueINR via fxRate; investedEUR stays null (not distinguishable in the sheet)', () => {
    const snapshots = [upstocksSnapshot({ date: '2024-01-01', valueINR: 10000 }), upstocksSnapshot({ date: '2024-06-01', valueINR: 15000 })]
    const view = buildNetWorth(undefined, plan(snapshots), null, null, null, 100)
    const row = view.sources.find((s) => s.source === 'upstocks')
    expect(row?.valueEUR).toBe(150) // last snapshot (15000), not the max — "latest" means last entry
    expect(row?.investedEUR).toBeNull()
    expect(row?.plEUR).toBeNull()
    expect(row?.plPct).toBeNull()
  })

  it('upstocks source is all-null when plan has no snapshots', () => {
    const view = buildNetWorth(undefined, plan([]), null, null, null, 100)
    expect(view.sources.find((s) => s.source === 'upstocks')?.valueEUR).toBeNull()
  })

  it('upstocks source respects the fxRate guard too', () => {
    const snapshots = [upstocksSnapshot({ valueINR: 10000 })]
    const view = buildNetWorth(undefined, plan(snapshots), null, null, null, -1)
    expect(view.sources.find((s) => s.source === 'upstocks')?.valueEUR).toBeNull()
  })

  it('totals sum only non-null valueEUR/investedEUR across sources', () => {
    const view = buildNetWorth(
      month(1000), // bank: value 1000, invested null
      plan([upstocksSnapshot({ valueINR: 20000 })]), // upstocks: value 200, invested null
      mf(20000, 25000), // mf: value 250, invested 200
      db([dbValuation('2024-01-01', 300)], 100), // db: value 300, invested 100
      binance(50, 75), // binance: value 75, invested 50
      100,
    )
    expect(view.totalEUR).toBe(1000 + 200 + 250 + 300 + 75)
    expect(view.investedTotalEUR).toBe(200 + 100 + 50)
  })

  it('totals are 0 when every source is disconnected', () => {
    const view = buildNetWorth(undefined, null, null, null, null, 100)
    expect(view.totalEUR).toBe(0)
    expect(view.investedTotalEUR).toBe(0)
  })
})

describe('project — compound-annually projection', () => {
  it('matches a hand-computed 3-year case: v = (v + contribution) * (1 + rate/100)', () => {
    // year1: (1000 + 100) * 1.1 = 1210
    // year2: (1210 + 100) * 1.1 = 1441
    // year3: (1441 + 100) * 1.1 = 1695.1
    const points = project(1000, 10, 100, 3)
    expect(points).toEqual([
      { year: 1, valueEUR: 1210 },
      { year: 2, valueEUR: 1441 },
      { year: 3, valueEUR: 1695.1 },
    ])
  })

  it('returns an empty array for zero years', () => {
    expect(project(1000, 10, 100, 0)).toEqual([])
  })

  it('handles a zero rate as flat contributions with no growth', () => {
    const points = project(0, 0, 500, 3)
    expect(points).toEqual([
      { year: 1, valueEUR: 500 },
      { year: 2, valueEUR: 1000 },
      { year: 3, valueEUR: 1500 },
    ])
  })
})
