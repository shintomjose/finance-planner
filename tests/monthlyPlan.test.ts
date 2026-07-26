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

  it('live-run correction #1: a labeled row with a genuinely blank amount is INCLUDED with plannedMonthly: null, no issue', () => {
    expect(result.budget.find((b) => b.category === 'Car Insurance')).toEqual({ category: 'Car Insurance', plannedMonthly: null })
    expect(result.issues.find((i) => i.cell === 'C9')).toBeUndefined()
  })

  it('reads totals from A26 (income), C27 (expense), D2 (surplus)', () => {
    expect(result.budgetTotals).toEqual({ income: 3900, expense: 3281.31, surplus: 618.69 })
  })
})

describe('Commerzbank loan (I1:J45, real layout: I2:I6 labels, J2:J6 values)', () => {
  it('reads principal/termMonths/interestEUR/totalEUR/monthlyEUR by label match (case-insensitive)', () => {
    expect(result.loan.principal).toBe(15000)
    expect(result.loan.termMonths).toBe(36)
    expect(result.loan.interestEUR).toBe(2537.35)
    expect(result.loan.totalEUR).toBe(17537.35)
    expect(result.loan.monthlyEUR).toBe(431.25)
  })

  it('reads 36 installments (rows 7-44, I plain number AND J numeric), paid-to-date (J45)', () => {
    expect(result.loan.installments).toHaveLength(36)
    expect(result.loan.installments[0]).toEqual({ n: 1, amountEUR: 431.25 })
    expect(result.loan.installments[35]).toEqual({ n: 36, amountEUR: 431.25 })
    expect(result.loan.paidToDate).toBe(8194)
  })

  it('row 43 (I="N/A", string) is silently skipped — no issue, not counted', () => {
    expect(result.issues.find((i) => i.cell === 'I43')).toBeUndefined()
    expect(result.loan.installments.some((x) => x.n === 37)).toBe(false)
  })

  it('row 44 (I=37 numeric but J="TBD" string) is silently skipped — no issue, not counted', () => {
    expect(result.issues.find((i) => i.cell === 'J44')).toBeUndefined()
    expect(result.loan.installments.some((x) => x.n === 37)).toBe(false)
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
  it('reads rate % (L11) and 13 year/value rows (K14:L26)', () => {
    expect(result.projection.ratePct).toBe(7.5)
    expect(result.projection.rows).toHaveLength(13)
    expect(result.projection.rows[0]).toEqual({ year: 2026, valueEUR: 21000 })
    expect(result.projection.rows[12]).toEqual({ year: 2038, valueEUR: 160559 })
  })

  it('live-run correction #3: a header string at L12 ("€ SAVINGS") is silently skipped -> yearlyContribution: null, no issue', () => {
    expect(result.projection.yearlyContribution).toBeNull()
    expect(result.issues.find((i) => i.cell === 'L12')).toBeUndefined()
  })

  it('live-run correction #3: a string value cell mid-block (L20, "TBD") is silently skipped -> valueEUR: null, no issue, row still counted', () => {
    expect(result.projection.rows[6]).toEqual({ year: 2032, valueEUR: null })
    expect(result.issues.find((i) => i.cell === 'L20')).toBeUndefined()
  })
})

describe('SBI Life schedule (A29:D63, real layout: A=index ignored, B=date, C=amount)', () => {
  it('reads 31 semiannual date/amount rows (B30:C60)', () => {
    expect(result.sbiLife).toHaveLength(31)
    expect(result.sbiLife[0]).toEqual({ date: '2027-01-15', amountINR: 5000 })
    expect(result.sbiLife[30]).toEqual({ date: '2042-01-15', amountINR: 5000 })
  })

  it('never reads the row-62 "Total" footer (fixed 30-60 bound, no 32nd entry)', () => {
    expect(result.sbiLife.some((s) => s.amountINR === 155000)).toBe(false)
  })

  it('the running-index column A is never date-parsed (no issue for any A-column cell)', () => {
    expect(result.issues.find((i) => i.cell?.startsWith('A3'))).toBeUndefined()
  })
})

describe('badminton gear logs (F30:G64 EUR, real layout: F=label, G=amountEUR, no dates)', () => {
  const eur = result.logs.filter((l) => l.log === 'gear' && 'amountEUR' in l.fields)

  it('parses 12 EUR entries, each with a null date', () => {
    expect(eur).toHaveLength(12)
    expect(eur.every((e) => e.date === null)).toBe(true)
    expect(eur[0]).toEqual({ log: 'gear', date: null, fields: { label: 'Shuttlecocks', amountEUR: 15.99 } })
  })

  it('a label present with a blank amount is included with amountEUR: null, no issue', () => {
    expect(eur.find((e) => e.fields.label === 'Overgrip')).toEqual({
      log: 'gear', date: null, fields: { label: 'Overgrip', amountEUR: null },
    })
    expect(result.issues.find((i) => i.cell === 'G40')).toBeUndefined()
  })

  it('a text-concat footer string ("Grand Total €: 291.73") is ignored silently — no entry, no issue', () => {
    expect(eur.some((e) => e.fields.label === undefined)).toBe(false)
    expect(result.issues.find((i) => i.cell === 'F43')).toBeUndefined()
    expect(eur).toHaveLength(12)
  })
})

describe('badminton gear logs (L50:N62 INR, real layout: L=label, N=amountINR, M=optional qty)', () => {
  const inr = result.logs.filter((l) => l.log === 'gear' && 'amountINR' in l.fields)

  it('parses 11 INR entries, each with a null date', () => {
    expect(inr).toHaveLength(11)
    expect(inr.every((e) => e.date === null)).toBe(true)
  })

  it('M holding a plain number is captured as field `qty`', () => {
    expect(inr.find((e) => e.fields.label === 'Grip Tape' && e.fields.qty === 2)).toEqual({
      log: 'gear', date: null, fields: { label: 'Grip Tape', amountINR: 150, qty: 2 },
    })
  })

  it('M blank or non-numeric ("pair") omits the `qty` field entirely, no issue', () => {
    const noQty = inr.filter((e) => e.fields.label === 'Shuttlecocks')
    expect(noQty.length).toBeGreaterThan(0)
    expect(noQty.every((e) => !('qty' in e.fields))).toBe(true)
    expect(result.issues.find((i) => i.cell === 'M59')).toBeUndefined()
  })
})

describe('gym log (H48:J74)', () => {
  const gym = result.logs.filter((l) => l.log === 'gym')

  it('parses 12 date/amount rows — full H48:J74 box', () => {
    expect(gym).toHaveLength(12)
    expect(gym[0]).toEqual({ log: 'gym', date: '2026-01-02', fields: { amountEUR: 15 } })
  })

  it('row 70 (beyond the old 49-58 loop, inside H48:J74) is picked up', () => {
    expect(gym.find((g) => g.date === '2026-06-26')).toEqual({ log: 'gym', date: '2026-06-26', fields: { amountEUR: 15.75 } })
  })

  it('planted "Monthly total review" at I72 (contains "total", no digit) -> NOT a silent footer-skip, records bad-number, row kept', () => {
    expect(gym.find((g) => g.date === null)).toEqual({ log: 'gym', date: null, fields: { amountEUR: null } })
    expect(result.issues).toContainEqual({
      sheet: 'MONTHLY_PLAN', cell: 'I72', kind: 'bad-number',
      detail: expect.stringContaining('Monthly total review'), raw: 'Monthly total review',
    })
  })

  it('live-run correction #7: footer label rows (H73 "TOTAL", H74 "AVG € PER DAY") are silently skipped — no entries, no issues', () => {
    expect(gym).toHaveLength(12)
    expect(result.issues.find((i) => i.cell === 'H73' || i.cell === 'H74')).toBeUndefined()
  })
})

describe('petrol log (F81:K153, real layout: F=index ignored, G=date, H=litres, I=amountEUR, J=perLitre, K=km)', () => {
  const petrol = result.logs.filter((l) => l.log === 'petrol')

  it('parses 11 real fills — full F81:K153 box (row 87 footer + row 153 footer excluded)', () => {
    expect(petrol).toHaveLength(11)
  })

  it('captures litres, amountEUR, perLitre, km fields; blank km stays null quietly', () => {
    expect(petrol[0]).toEqual({
      log: 'petrol', date: '2026-01-10',
      fields: { litres: 40.5, amountEUR: 70.88, perLitre: 1.75, km: 15234 },
    })
    expect(petrol[1].fields.km).toBeNull()
  })

  it('rows 120 and 145 (beyond the old 82-90 window, inside F81:K153) are picked up by the widened loop', () => {
    expect(petrol.find((p) => p.date === '2026-06-18')).toEqual({
      log: 'petrol', date: '2026-06-18',
      fields: { litres: 41.2, amountEUR: 72.1, perLitre: 1.75, km: 17200 },
    })
    const p145 = petrol.find((p) => p.date === '2026-07-30')
    expect(p145?.fields.km).toBeNull()
  })

  it('last real fill is row 152 (13-08-2026)', () => {
    expect(petrol.find((p) => p.date === '2026-08-13')).toEqual({
      log: 'petrol', date: '2026-08-13',
      fields: { litres: 36.4, amountEUR: 63.7, perLitre: 1.75, km: 17550 },
    })
  })

  it('planted bad date at G85 -> bad-date issue, row still kept with date: null', () => {
    const badRow = petrol.find((p) => p.fields.amountEUR === 73.5)
    expect(badRow).toEqual({
      log: 'petrol', date: null,
      fields: { litres: 42, amountEUR: 73.5, perLitre: 1.75, km: 15890 },
    })
    expect(result.issues).toContainEqual({
      sheet: 'MONTHLY_PLAN', cell: 'G85', kind: 'bad-date',
      detail: expect.stringContaining('not-a-date'), raw: 'not-a-date',
    })
  })

  it('planted text-concat subtotal at I87 ("Grand Total €: 291.73") is ignored silently — no entry, no issue', () => {
    expect(petrol.some((p) => typeof p.fields.amountEUR === 'string')).toBe(false)
    expect(result.issues.find((i) => i.cell === 'I87')).toBeUndefined()
  })

  it('live-run correction #8: row-153 "Total" footer (G153) is silently skipped before any date-parsing — no entry, no issue', () => {
    expect(petrol.some((p) => p.date === null && p.fields.amountEUR === null)).toBe(false)
    expect(result.issues.find((i) => i.cell === 'G153')).toBeUndefined()
    expect(petrol).toHaveLength(11)
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

describe('alcohol log (A126:C161, real layout: row 126 header, A=index ignored, B=label, C=amountEUR)', () => {
  const alcohol = result.logs.filter((l) => l.log === 'alcohol')

  it('parses 5 real entries with null dates; scaffold rows (index-only) are not counted', () => {
    expect(alcohol).toHaveLength(5)
    expect(alcohol.every((a) => a.date === null)).toBe(true)
    expect(alcohol[0]).toEqual({ log: 'alcohol', date: null, fields: { label: 'Coors', amountEUR: 25.5 } })
    expect(alcohol[4]).toEqual({ log: 'alcohol', date: null, fields: { label: 'Rum', amountEUR: 27.25 } })
  })

  it('the header row (B126 "Item"/C126 "Amount") is never read as data', () => {
    expect(alcohol.some((a) => a.fields.label === 'Item')).toBe(false)
  })
})

describe('overall issue set', () => {
  it('contains exactly the 3 planted issue-worthy cells (ref-error, bad-date, bad-number) — no stray drops', () => {
    const kinds = result.issues.map((i) => `${i.kind}@${i.cell}`).sort()
    expect(kinds).toEqual(['bad-date@G85', 'bad-number@I72', 'ref-error@L4'])
  })
})
