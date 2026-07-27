// Overview "Card & person dues" rows (spec 2026-07-27 §3). The sheet's own
// M/N/O upcoming block carries stale/duplicated card figures, so the owner
// defined the real dues as arithmetic over the bank-scratch statement
// balances (MonthData.scratch, parse/month.ts) minus what was already paid
// this month (expense rows for that card). Cell refs in comments document
// the live JUL_26 layout only — every lookup is label-based.
//
// Owner formulas (JUL_26 reference):
//   Advanzia            = J14 "Current Advancia" − D6  "Advancia CC"
//   Amazon (Sparkasse)  = J13 "Current Amazon"   − D15 "Amazon CC"
//   Amex                = J17 "Amex"             − D19 "Amex CC"
//   Sachin              = L18 "SACHIN" − SACHIN!G132 (ledger remaining) − J18 "Sachin"
//
// A missing input makes the row's due null with a note naming what's
// missing — never a fabricated 0. No clamping: Amex can legitimately go
// negative (paid more than the current statement).
import { round2 } from './mathUtils'
import { normLabel } from './normalize'
import type { MonthData, ScratchEntry, Tx } from '../types'

export type CardDueKey = 'advanzia' | 'sparkasse' | 'amex' | 'sachin'

export interface CardDue {
  key: CardDueKey
  label: string
  due: number | null
  note: string
}

const eurFmt = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
const fmt = (v: number) => eurFmt.format(v)

function findScratch(
  scratch: ScratchEntry[], block: ScratchEntry['block'], pred: (norm: string) => boolean
): number | null {
  const hit = scratch.find((s) => s.block === block && pred(s.normLabel))
  return hit ? hit.amountEUR : null
}

/** Sum of this month's expense rows whose normLabel equals `norm` exactly.
 * The "<card> CC" payment labels are folded onto the canonical card names by
 * normalize.ts ALIASES ('advancia cc' → 'advanzia', 'amazon cc' →
 * 'sparkasse', 'amex cc' → 'amex'), so an exact match is sufficient — and it
 * deliberately does NOT catch unrelated rows like 'amazon prime'. A month
 * with no matching row paid €0 toward that card (a real statement balance
 * minus nothing is still due in full), so this returns 0, not null. */
function paidTowards(expenses: Tx[], norm: string): number {
  return round2(expenses.filter((tx) => tx.normLabel === norm).reduce((s, tx) => s + (tx.amountEUR ?? 0), 0))
}

const isAdvanzia = (n: string) => /advan[cz]ia/.test(n)

function cardRow(key: CardDueKey, label: string, balance: number | null, paid: number, balanceName: string): CardDue {
  if (balance == null) {
    return { key, label, due: null, note: `no "${balanceName}" scratch figure this month` }
  }
  const due = round2(balance - paid)
  const note = paid !== 0 ? `${fmt(balance)} statement − ${fmt(paid)} paid` : `${fmt(balance)} statement, nothing paid yet`
  return { key, label, due, note }
}

/**
 * The four owner-defined dues rows for one month. `sachinRemaining` is
 * `sachin.ledger.totals.remaining` (SACHIN!G132, read and trusted as-is —
 * see parse/sachin.ts) or null when the SACHIN tab is unavailable.
 */
export function cardDues(month: MonthData, sachinRemaining: number | null): CardDue[] {
  const scratch = month.scratch ?? []
  const advanziaBalance = findScratch(scratch, 'IJ', (n) => isAdvanzia(n) && n.includes('current'))
  const amazonBalance = findScratch(scratch, 'IJ', (n) => n.includes('amazon') && n.includes('current'))
  const amexBalance = findScratch(scratch, 'IJ', (n) => n === 'amex')
  const sachinIJ = findScratch(scratch, 'IJ', (n) => n === 'sachin')
  const sachinKL = findScratch(scratch, 'KL', (n) => n === 'sachin')

  const rows: CardDue[] = [
    cardRow('advanzia', 'Advanzia', advanziaBalance, paidTowards(month.expenses, 'advanzia'), 'Current Advanzia'),
    cardRow('sparkasse', 'Amazon (Sparkasse)', amazonBalance, paidTowards(month.expenses, 'sparkasse'), 'Current Amazon'),
    cardRow('amex', 'Amex', amexBalance, paidTowards(month.expenses, 'amex'), 'Amex'),
  ]

  // Sachin: KL "SACHIN" − ledger remaining (G132) − IJ "Sachin". The note
  // always spells out both subtrahends (owner: "always show in bracket how
  // much is J18 and how much is SACHIN!G132") when the row computes.
  const missing: string[] = []
  if (sachinKL == null) missing.push('no "SACHIN" scratch figure this month')
  if (sachinRemaining == null) missing.push('SACHIN ledger unavailable')
  if (sachinIJ == null) missing.push('no "Sachin" bank-scratch figure this month')
  if (missing.length > 0) {
    rows.push({ key: 'sachin', label: 'Sachin', due: null, note: missing.join(' · ') })
  } else {
    rows.push({
      key: 'sachin',
      label: 'Sachin',
      due: round2(sachinKL! - sachinRemaining! - sachinIJ!),
      note: `${fmt(sachinKL!)} − ledger remaining ${fmt(sachinRemaining!)} − scratch ${fmt(sachinIJ!)}`,
    })
  }

  return rows
}

/** Sum of the computable dues (null rows contribute nothing). */
export function duesTotal(rows: CardDue[]): number {
  return round2(rows.reduce((s, r) => s + (r.due ?? 0), 0))
}

/**
 * Double-count guard for the Overview Upcoming panel (spec 2026-07-27 §6):
 * an upcoming M/N/O row that IS a card statement ("Advancia Credit Card",
 * "Amazon CC", "Amex") duplicates a computed due above it and must be
 * dropped from the bills list. A row is a statement row when its normLabel,
 * with card filler words (credit card / cc / bill) stripped, is exactly a
 * card name — so "Amex Netto", "Advanzia Add", "Sparkasse Interest",
 * "Amazon Prime" (extra meaningful words) all stay real bills.
 */
export function isCardStatementUpcoming(name: string): boolean {
  // 'bill' is deliberately NOT a strip word: "Amazon Bill" is the
  // frequency-34 FIXED label (normalize.ts seed — a recurring service bill,
  // not the Sparkasse card); stripping it would silently swallow that row
  // (reviewer finding, 2026-07-27).
  const stripped = normLabel(name).replace(/\b(credit card|credit|card|cc)\b/g, ' ').replace(/\s+/g, ' ').trim()
  return ['advanzia', 'advancia', 'amex', 'sparkasse', 'amazon'].includes(stripped)
}
