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

const plan = (
  upstocks: InvestmentSnapshot[] = [],
  projection?: Partial<MonthlyPlanData['projection']>,
  sbi?: { sandra?: MonthlyPlanData['sandraSbiLife']; totalINR?: number | null },
): MonthlyPlanData => ({
  budget: [],
  budgetTotals: { income: null, expense: null, surplus: null },
  loan: { principal: null, termMonths: null, interestEUR: null, totalEUR: null, monthlyEUR: null, installments: [], paidToDate: null },
  savingsSnapshots: [],
  projection: { ratePct: null, yearlyContribution: null, rows: [], ...projection },
  sbiLife: [],
  shintoSbiLifeINR: sbi?.totalINR ?? null,
  sandraSbiLife: sbi?.sandra ?? { rows: [], totalINR: null },
  logs: [],
  upstocks,
  issues: [],
})

const mf = (investedTotalINR: number | null, fundTotals: MutualFundsData['fundTotals'] = []): MutualFundsData => ({
  snapshots: [],
  summary: { investedINR: null, currentINR: null, pctChange: null },
  fundTotals,
  investedTotalINR,
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

  it('db source is the G91 PAID grand total (owner 2026-07-31), no invested/P/L pair', () => {
    const data = db(
      [dbValuation('2024-01-01', 1000), dbValuation('2024-06-01', 1200)], // valuations no longer drive the row
      1000,
    )
    const view = buildNetWorth(undefined, null, null, data, null, 100)
    const row = view.sources.find((s) => s.source === 'db')
    expect(row).toEqual({ source: 'db', label: 'Deutsche Bank (paid)', valueEUR: 1000, investedEUR: null, plEUR: null, plPct: null })
  })

  it('db source is all-null when db is not connected', () => {
    const view = buildNetWorth(undefined, null, null, null, null, 100)
    expect(view.sources.find((s) => s.source === 'db')).toEqual({
      source: 'db', label: 'Deutsche Bank (paid)', valueEUR: null, investedEUR: null, plEUR: null, plPct: null,
    })
  })

  it('mf source is the row-38 invested total (owner 2026-07-31) converted via fxRate', () => {
    const data = mf(25000)
    const view = buildNetWorth(undefined, null, data, null, null, 100)
    const row = view.sources.find((s) => s.source === 'mf')
    expect(row).toEqual({ source: 'mf', label: 'India Mutual Funds', valueEUR: 250, investedEUR: null, plEUR: null, plPct: null })
  })

  it('mf source is all-null with a non-positive fxRate (guarded), row still present', () => {
    const data = mf(25000)
    const view = buildNetWorth(undefined, null, data, null, null, 0)
    expect(view.sources.find((s) => s.source === 'mf')).toEqual({
      source: 'mf', label: 'India Mutual Funds', valueEUR: null, investedEUR: null, plEUR: null, plPct: null,
    })
  })

  it('mf source is all-null with a non-finite fxRate (guarded)', () => {
    const data = mf(25000)
    const view = buildNetWorth(undefined, null, data, null, null, NaN)
    expect(view.sources.find((s) => s.source === 'mf')?.valueEUR).toBeNull()
  })

  it('sbi sources (owner 2026-07-31): Sandra uses her block TOTAL; Shinto converts C61 (G8 never used)', () => {
    const p = plan([], undefined, {
      sandra: { rows: [{ date: '2024-08-18', amountINR: 50000 }, { date: '2025-07-30', amountINR: 70000 }], totalINR: 120000 },
      totalINR: 155000,
    })
    const view = buildNetWorth(undefined, p, null, null, null, 100)
    expect(view.sources.find((s) => s.source === 'sbi-sandra')?.valueEUR).toBe(1200)
    expect(view.sources.find((s) => s.source === 'sbi')?.valueEUR).toBe(1550)
  })

  it('sandra sbi falls back to summing her rows when the block TOTAL is missing', () => {
    const p = plan([], undefined, {
      sandra: { rows: [{ date: '2024-08-18', amountINR: 50000 }, { date: null, amountINR: 70000 }], totalINR: null },
    })
    const view = buildNetWorth(undefined, p, null, null, null, 100)
    expect(view.sources.find((s) => s.source === 'sbi-sandra')?.valueEUR).toBe(1200)
  })

  it('sbi sources are all-null when the plan is not connected', () => {
    const view = buildNetWorth(undefined, null, null, null, null, 100)
    expect(view.sources.find((s) => s.source === 'sbi-sandra')?.valueEUR).toBeNull()
    expect(view.sources.find((s) => s.source === 'sbi')?.valueEUR).toBeNull()
  })

  it('binance source passes EUR figures straight through and is display-only (owner 2026-07-31)', () => {
    const data = binance(400, 550)
    const view = buildNetWorth(undefined, null, null, null, data, 100)
    const row = view.sources.find((s) => s.source === 'binance')
    expect(row).toEqual({ source: 'binance', label: 'Binance', valueEUR: 550, investedEUR: 400, plEUR: 150, plPct: 37.5, displayOnly: true })
    expect(view.totalEUR).toBe(0) // shown, never counted
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

  it('totals count only non-displayOnly sources (Binance/Upstocks shown but excluded)', () => {
    const view = buildNetWorth(
      month(1000), // bank: value 1000, invested null
      plan([upstocksSnapshot({ valueINR: 20000 })], undefined, { totalINR: 10000 }), // upstocks 200 (display-only) + shinto sbi 100
      mf(25000), // mf: value 250 (row-38 invested total)
      db([dbValuation('2024-01-01', 300)], 100), // db: value 100 (G91 paid)
      binance(50, 75), // binance: 75/50, display-only
      100,
    )
    expect(view.totalEUR).toBe(1000 + 250 + 100 + 100)
    expect(view.investedTotalEUR).toBe(0) // binance's invested 50 is display-only too
    expect(view.nonBankTotalEUR).toBe(250 + 100 + 100) // counted sources minus bank cash
  })

  it('totals are 0 when every source is disconnected', () => {
    const view = buildNetWorth(undefined, null, null, null, null, 100)
    expect(view.totalEUR).toBe(0)
    expect(view.investedTotalEUR).toBe(0)
  })
})

describe('project — ordinary-annuity compounding (grow, then contribute)', () => {
  it('reproduces MONTHLY_PLAN\'s own K11:R26 fixture sequence: rate 7.5%, yearly contribution 6000, starting 21000', () => {
    // Sheet's first three steps: 21000 -> 28575 -> 36718 -> 45472 (+-1 rounding).
    // v = v * (1 + rate/100) + contribution:
    //   21000 * 1.075 + 6000 = 28575
    //   28575 * 1.075 + 6000 = 36718.125 ~= 36718
    //   36718.125 * 1.075 + 6000 = 45471.984375 ~= 45472
    const points = project(21000, 7.5, 6000, 3)
    expect(points[0].valueEUR).toBe(28575)
    expect(Math.round(points[1].valueEUR)).toBe(36718)
    expect(Math.round(points[2].valueEUR)).toBe(45472)
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
