// Overview "Card & person dues" rows (spec 2026-07-27 §3). The sheet's own
// M/N/O upcoming block carries stale/duplicated card figures, so the owner
// defined the real dues as arithmetic over the bank-scratch statement
// balances (MonthData.scratch, parse/month.ts) minus what was already paid
// this month (expense rows for that card). Cell refs in comments document
// the live JUL_26 layout only — every lookup is label-based.
//
// Owner formulas (JUL_26 reference; revised 2026-07-27 late — owner: "I
// already deduct the paid amount in Advanzia and for Amex and Sparkasse",
// i.e. the sheet's Current-X scratch figures are ALREADY net of this
// month's payments, so the card dues are the scratch balances alone; the
// payment sum is informational only, shown in the row note):
//   Advanzia            = J14 "Current Advancia"   (paid: Σ 'advanzia' rows, note only)
//   Amazon (Sparkasse)  = J13 "Current Amazon"     (paid: Σ 'sparkasse' rows, note only)
//   Amex                = J17 "Amex"               (paid: Σ 'amex' rows, note only)
//
// The computed Sachin due was REMOVED entirely (owner 2026-07-27 latest:
// formula was wrong; Sachin now lives on the income side — see
// lib/upcomingIncome.ts). The bare "Sachin" M/N/O row stays dropped from
// the bills list via isDueCoveredUpcoming below.
//
// A missing input makes the row's due null with a note naming what's
// missing — never a fabricated 0.
import { round2 } from './mathUtils'
import { normLabel } from './normalize'
import type { MonthData, ScratchEntry, Tx } from '../types'

export type CardDueKey = 'advanzia' | 'sparkasse' | 'amex'

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
  // The scratch balance is already net of payments (owner) — `paid` is a
  // display-only line, never subtracted.
  const note = paid !== 0 ? `${fmt(paid)} paid this month (already reflected)` : 'nothing paid yet this month'
  return { key, label, due: round2(balance), note }
}

/** The three owner-defined card-dues rows for one month. */
export function cardDues(month: MonthData): CardDue[] {
  const scratch = month.scratch ?? []
  const advanziaBalance = findScratch(scratch, 'IJ', (n) => isAdvanzia(n) && n.includes('current'))
  const amazonBalance = findScratch(scratch, 'IJ', (n) => n.includes('amazon') && n.includes('current'))
  const amexBalance = findScratch(scratch, 'IJ', (n) => n === 'amex')

  return [
    cardRow('advanzia', 'Advanzia', advanziaBalance, paidTowards(month.expenses, 'advanzia'), 'Current Advanzia'),
    cardRow('sparkasse', 'Amazon (Sparkasse)', amazonBalance, paidTowards(month.expenses, 'sparkasse'), 'Current Amazon'),
    cardRow('amex', 'Amex', amexBalance, paidTowards(month.expenses, 'amex'), 'Amex'),
  ]
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
/** Upcoming rows that must never appear in the bills list: card statement
 * rows (duplicated by the computed dues) AND the bare "Sachin" row (owner
 * 2026-07-27: Sachin is money owed TO him — an income expectation, tracked
 * in lib/upcomingIncome.ts — never an upcoming expense). */
export function isDueCoveredUpcoming(name: string): boolean {
  return isCardStatementUpcoming(name) || normLabel(name) === 'sachin'
}

export function isCardStatementUpcoming(name: string): boolean {
  // 'bill' is deliberately NOT a strip word: "Amazon Bill" is the
  // frequency-34 FIXED label (normalize.ts seed — a recurring service bill,
  // not the Sparkasse card); stripping it would silently swallow that row
  // (reviewer finding, 2026-07-27).
  const stripped = normLabel(name).replace(/\b(credit card|credit|card|cc)\b/g, ' ').replace(/\s+/g, ' ').trim()
  return ['advanzia', 'advancia', 'amex', 'sparkasse', 'amazon'].includes(stripped)
}
