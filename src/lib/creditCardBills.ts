// Overview "Credit cards" panel pure logic (owner request, 2026-07-26):
// group the displayed month's expenses whose category is 'credit card'
// (seed: amex, sparkasse, advanzia — see normalize.ts) by label, with a
// footer total. The Advancia/Advanzia typo merge happens for free here
// since normLabel() (applied at parse time, src/parse/month.ts) already
// folds 'advancia' into 'advanzia' via normalize.ts's ALIASES map — this
// helper just groups by whatever label the transaction carries.
import { round2 } from './mathUtils'
import { categorize } from './normalize'
import type { Tx } from '../types'

export const CREDIT_CARD_CATEGORY = 'credit card'

export interface CreditCardRow { label: string; amountEUR: number }
export interface CreditCardBills { rows: CreditCardRow[]; total: number }

// Display label is derived from the NORMALIZED key (not the raw tx.label)
// and title-cased, so a card whose raw spelling varies by month (Advancia
// vs Advanzia) always renders under one consistent name regardless of which
// variant happened to appear first in the expense list.
function titleCase(norm: string): string {
  return norm.replace(/\b\w/g, (c) => c.toUpperCase())
}

export function creditCardBills(expenses: Tx[], overrides?: Record<string, string>): CreditCardBills {
  const sums = new Map<string, number>()

  for (const tx of expenses) {
    if (categorize(tx.normLabel, overrides) !== CREDIT_CARD_CATEGORY) continue
    sums.set(tx.normLabel, (sums.get(tx.normLabel) ?? 0) + (tx.amountEUR ?? 0))
  }

  const rows = [...sums.entries()]
    .map(([norm, amountEUR]) => ({ label: titleCase(norm), amountEUR: round2(amountEUR) }))
    .sort((a, b) => a.label.localeCompare(b.label))

  const total = round2(rows.reduce((sum, r) => sum + r.amountEUR, 0))

  return { rows, total }
}
