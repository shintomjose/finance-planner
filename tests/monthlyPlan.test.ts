import { describe, it, expect } from 'vitest'
import { parseMonthlyPlan } from '../src/parse/monthlyPlan'
import fixture from './fixtures/MONTHLY_PLAN.json'
import type { SpecialGrids } from '../src/data/specialTabs'

const grids = fixture as SpecialGrids
const result = parseMonthlyPlan(grids)

describe('budget plan (A1:D27)', () => {
  it('parses the 24 expense pairs (B2:C25) into budget[]', () => {
    expect(result.budget).toHaveLength(24)
    expect(result.budget[0]).toEqual({ category: 'Rent', plannedMonthly: 850 })
    expect(result.budget.find((b) => b.category === 'Loan Payment')).toEqual({ category: 'Loan Payment', plannedMonthly: 631.31 })
  })

  it('reads totals from A26 (income), C27 (expense), D2 (surplus)', () => {
    expect(result.budgetTotals).toEqual({ income: 3900, expense: 3361.31, surplus: 538.69 })
  })
})

describe('Commerzbank loan (I1:J45)', () => {
  it('reads principal (J1), 36 installments (I2:J37), paid-to-date (J45)', () => {
    expect(result.loan.principal).toBe(15000)
    expect(result.loan.installments).toHaveLength(36)
    expect(result.loan.installments[0]).toEqual({ n: 1, amountEUR: 431.25 })
    expect(result.loan.installments[35]).toEqual({ n: 36, amountEUR: 431.25 })
    expect(result.loan.paidToDate).toBe(8194)
  })
})

describe('savings snapshots (K1:N7)', () => {
  it('reads 6 label/amount rows (K2:L7)', () => {
    expect(result.savingsSnapshots).toHaveLength(6)
    expect(result.savingsSnapshots[0]).toEqual({ label: 'Emergency Fund', amountEUR: 5000 })
    expect(result.savingsSnapshots[4]).toEqual({ label: 'Gift Fund', amountEUR: 150 })
  })

  it('planted #REF! at L4 -> ref-error issue, entry kept with null amount', () => {
    expect(result.savingsSnapshots[2]).toEqual({ label: 'Loan Reserve', amountEUR: null })
    expect(result.issues).toContainEqual({
      sheet: 'MONTHLY_PLAN', cell: 'L4', kind: 'ref-error',
      detail: expect.stringContaining('#REF!'), raw: '#REF!',
    })
  })
})

describe('2035 projection (K11:R26)', () => {
  it('reads rate % (L11), yearly contribution (L12), and 13 year/value rows (K14:L26)', () => {
    expect(result.projection.ratePct).toBe(7.5)
    expect(result.projection.yearlyContribution).toBe(6000)
    expect(result.projection.rows).toHaveLength(13)
    expect(result.projection.rows[0]).toEqual({ year: 2026, valueEUR: 21000 })
    expect(result.projection.rows[12]).toEqual({ year: 2038, valueEUR: 160559 })
  })
})

describe('SBI Life schedule (A29:D63)', () => {
  it('reads 31 semiannual date/amount rows (A30:B60)', () => {
    expect(result.sbiLife).toHaveLength(31)
    expect(result.sbiLife[0]).toEqual({ date: '2027-01-15', amountINR: 5000 })
    expect(result.sbiLife[30]).toEqual({ date: '2042-01-15', amountINR: 5000 })
  })

  it('never reads the A62 "Total" footer row (fixed 30-60 bound, no 32nd entry)', () => {
    expect(result.sbiLife.some((s) => s.amountINR === 155000)).toBe(false)
  })
})

describe('badminton gear logs (F30:G64 EUR + L50:N62 INR)', () => {
  it('parses 12 EUR entries — full F30:G64 box, not just the old 31-40 window', () => {
    const eur = result.logs.filter((l) => l.log === 'gear' && 'amountEUR' in l.fields)
    expect(eur).toHaveLength(12)
    expect(eur[0]).toEqual({ log: 'gear', date: '2026-03-05', fields: { amountEUR: 15.99 } })
  })

  it('row 60 (beyond the old 31-40 loop, inside F30:G64) is picked up by the widened loop', () => {
    const eur = result.logs.filter((l) => l.log === 'gear' && 'amountEUR' in l.fields)
    expect(eur.find((e) => e.date === '2026-10-15')).toEqual({ log: 'gear', date: '2026-10-15', fields: { amountEUR: 99 } })
  })

  it('row 62: date present (F62), amount blank (G62) -> planned entry, amountEUR: null, NO issue', () => {
    const eur = result.logs.filter((l) => l.log === 'gear' && 'amountEUR' in l.fields)
    expect(eur.find((e) => e.date === '2026-11-22')).toEqual({ log: 'gear', date: '2026-11-22', fields: { amountEUR: null } })
    expect(result.issues.find((i) => i.cell === 'G62')).toBeUndefined()
  })

  it('parses 11 INR entries — full L50:N62 box, not just the old 51-60 window', () => {
    const inr = result.logs.filter((l) => l.log === 'gear' && 'amountINR' in l.fields)
    expect(inr).toHaveLength(11)
    expect(inr[0]).toEqual({ log: 'gear', date: '2026-02-10', fields: { amountINR: 800, item: 'Shuttlecocks' } })
  })

  it('row 61 (beyond the old 51-60 loop, inside L50:N62) is picked up by the widened loop', () => {
    const inr = result.logs.filter((l) => l.log === 'gear' && 'amountINR' in l.fields)
    expect(inr.find((e) => e.fields.item === 'Net')).toEqual({ log: 'gear', date: '2026-10-05', fields: { amountINR: 2400, item: 'Net' } })
  })
})

describe('gym log (H48:J74)', () => {
  it('parses 12 date/amount rows — full H48:J74 box, not just the old 49-58 window', () => {
    const gym = result.logs.filter((l) => l.log === 'gym')
    expect(gym).toHaveLength(12)
    expect(gym[0]).toEqual({ log: 'gym', date: '2026-01-02', fields: { amountEUR: 15 } })
  })

  it('row 70 (beyond the old 49-58 loop, inside H48:J74) is picked up by the widened loop', () => {
    const gym = result.logs.filter((l) => l.log === 'gym')
    expect(gym.find((g) => g.date === '2026-06-26')).toEqual({ log: 'gym', date: '2026-06-26', fields: { amountEUR: 15.75 } })
  })

  it('planted "Monthly total review" at I72 (contains "total", no digit) -> NOT a silent footer-skip, records bad-number, row kept', () => {
    const gym = result.logs.filter((l) => l.log === 'gym')
    expect(gym.find((g) => g.date === null)).toEqual({ log: 'gym', date: null, fields: { amountEUR: null } })
    expect(result.issues).toContainEqual({
      sheet: 'MONTHLY_PLAN', cell: 'I72', kind: 'bad-number',
      detail: expect.stringContaining('Monthly total review'), raw: 'Monthly total review',
    })
  })
})

describe('petrol log (F81:K153)', () => {
  const petrol = result.logs.filter((l) => l.log === 'petrol')

  it('parses 10 real fills — full F81:K153 box (one footer row excluded)', () => {
    expect(petrol).toHaveLength(10)
  })

  it('rows 120 and 145 (beyond the old 82-90 loop, inside F81:K153) are picked up by the widened loop', () => {
    expect(petrol.find((p) => p.date === '2026-06-18')).toEqual({
      log: 'petrol', date: '2026-06-18',
      fields: { litres: 41.2, amountEUR: 72.1, perLitre: 1.75, km: 17200 },
    })
    const p145 = petrol.find((p) => p.date === '2026-07-30')
    expect(p145?.fields.km).toBeNull()
  })

  it('captures litres, amountEUR, perLitre, km fields; blank km stays null quietly', () => {
    expect(petrol[0]).toEqual({
      log: 'petrol', date: '2026-01-10',
      fields: { litres: 40.5, amountEUR: 70.88, perLitre: 1.75, km: 15234 },
    })
    expect(petrol[1].fields.km).toBeNull()
  })

  it('planted bad date at F84 -> bad-date issue, row still kept with date: null', () => {
    const badRow = petrol.find((p) => p.fields.amountEUR === 73.5)
    expect(badRow).toEqual({
      log: 'petrol', date: null,
      fields: { litres: 42, amountEUR: 73.5, perLitre: 1.75, km: 15890 },
    })
    expect(result.issues).toContainEqual({
      sheet: 'MONTHLY_PLAN', cell: 'F84', kind: 'bad-date',
      detail: expect.stringContaining('not-a-date'), raw: 'not-a-date',
    })
  })

  it('planted text-concat subtotal at H86 ("Grand Total €: 4630.34") is ignored silently — no entry, no issue', () => {
    expect(petrol.some((p) => typeof p.fields.amountEUR === 'string')).toBe(false)
    expect(result.issues.find((i) => i.cell === 'H86')).toBeUndefined()
  })
})

describe('Binance copy (A65:C95) — SKIPPED entirely', () => {
  it('never surfaces the planted #REF! at B70 — that range is never read', () => {
    expect(result.issues.find((i) => i.cell === 'B70')).toBeUndefined()
  })
})

describe('UPSTOCS (A97:C123)', () => {
  it('parses 8 date/label/value snapshots as InvestmentSnapshot[]', () => {
    expect(result.upstocks).toHaveLength(8)
    expect(result.upstocks[0]).toEqual({
      date: '2026-01-15', source: 'upstocks', asset: 'Upstox Snapshot', valueINR: 125000,
    })
    expect(result.upstocks[7].valueINR).toBe(142950)
  })
})

describe('alcohol log (A126:C161)', () => {
  const alcohol = result.logs.filter((l) => l.log === 'alcohol')

  it('parses 5 real entries; 31 pre-numbered scaffold rows (running number only) are not counted', () => {
    expect(alcohol).toHaveLength(5)
    expect(alcohol[0]).toEqual({ log: 'alcohol', date: '2026-01-12', fields: { amountEUR: 25.5 } })
    expect(alcohol[4]).toEqual({ log: 'alcohol', date: '2026-02-09', fields: { amountEUR: 27.25 } })
  })
})

describe('overall issue set', () => {
  it('contains exactly the 3 planted issue-worthy cells (ref-error, bad-date, bad-number) — no stray drops', () => {
    const kinds = result.issues.map((i) => `${i.kind}@${i.cell}`).sort()
    expect(kinds).toEqual(['bad-date@F84', 'bad-number@I72', 'ref-error@L4'])
  })
})
