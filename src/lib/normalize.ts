// Label normalization + category seed map, built from
// .claude/skills/finance-planner/workbook-map.md section "4. Labels — category-map seed".
//
// Compound entries in the source doc are split into individual labels; case/variant
// notation (e.g. `DM/dm`, `rewe/Rewe`) collapses to a single normalized key.
// `sachin` and `revolut` appear in both the Family and Income label lists — since
// SEED_CATEGORIES is a flat map, each key can only hold one category. Per project
// decision: `sachin` -> family, `revolut` -> income, `n26` -> family.

// Owner typo aliasing: the sheet has label variants that are the SAME
// underlying thing, just misspelled inconsistently on data-entry (owner
// live-review confirmation, 2026-07-26: "Advanzia" / "Advancia" are one
// credit card). Keyed/valued on the ALREADY basic-normalized (trim/collapse-
// whitespace/lowercase) form so this is a plain post-processing map — add a
// new typo merge here as `<misspelled-normalized>: '<canonical-normalized>'`.
const ALIASES: Record<string, string> = {
  advancia: 'advanzia',
  // Owner's month-ledger card-payment rows are labeled "<card> CC"
  // ("Advancia CC" D6, "Amex CC" D19 on the live JUL_26) — fold them onto
  // the canonical card labels so exact-match categorize() lands them in the
  // 'credit card' bucket and lib/cardDues.ts can sum payments per card
  // (spec 2026-07-27 §2; they were silently 'uncategorized' before).
  'advancia cc': 'advanzia',
  'advanzia cc': 'advanzia',
  'amex cc': 'amex',
  // Owner (2026-07-26): the sheet label "Amazon CC" IS the Sparkasse card —
  // merge it so credit-card grouping shows one Sparkasse row.
  'amazon cc': 'sparkasse',
}

export function normLabel(raw: string): string {
  const basic = raw.trim().replace(/\s+/g, ' ').toLowerCase()
  return ALIASES[basic] ?? basic
}

function seedGroup(labels: string[], category: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const label of labels) out[normLabel(label)] = category
  return out
}

const GROCERIES = [
  'Edeka',
  'Kaufland',
  'Lidl',
  'Indian Store',
  'DM',
  'Rewe',
  'Netto',
  'Aldi talk',
]

const FIXED = [
  'Rent',
  'DISABILITY',
  'SHORT TERM',
  'LIABILITY & UNFALL INS',
  'Vodafone',
  'o2',
  'EnBW',
  'Gym',
  'Radio',
  'Amazon Bill',
  'CommerzBank emi',
  'Reccurring(Fed 9000)',
  'Reccurring(SC 10000)',
  'Car-320',
  'SBI Life(36596)',
  'Telekom',
  'ICICI BILL',
  // 'Amazon CC' intentionally absent: aliased to 'sparkasse' (credit card).
  'iPhone',
  'Mutual Funds & India',
]

const FAMILY = [
  'Sachin',
  'N26',
  'Sandra Savings India(2400)',
  'Sandra Phone',
  'Sandra pocket money(25)',
  'To India',
]

const LIFESTYLE = [
  'Church',
  'Parking',
  'Petrol',
  'Lotto',
  'Apotheke',
  'Medical Store',
  'Doner',
  'Lunch-Doner',
  'Cake',
  'Burger King',
  'Car Service',
  'Food Home',
  'Yufka',
  'Cig',
  'Post',
]

const INCOME = [
  'Revolut Add',
  'Salary',
  // 'Sachin' also appears here — resolved to `family` above (see file header note).
  'Revolut',
  'KinderGeld',
  'Achachan',
  'Pfand',
  'KG',
  'Anu',
  'Monu',
  'Sandra',
  'ElternGeld',
  'Uncle',
  'EG',
  'Binance',
]

const TRANSFER = [
  'Last Month Balance',
]

// Owner's actual credit cards (live-review, 2026-07-26): Amex, Sparkasse,
// Advanzia. 'amazon cc' is aliased to 'sparkasse' (owner: same card);
// 'icici bill' stays in FIXED — owner named exactly these 3 cards.
// 'advanzia' here also catches the 'advancia' typo via the ALIASES map above
// (normLabel runs before this lookup for every consumer).
const CREDIT_CARD = [
  'Amex',
  'Sparkasse',
  'Advanzia',
]

export const SEED_CATEGORIES: Record<string, string> = {
  ...seedGroup(GROCERIES, 'groceries'),
  ...seedGroup(FIXED, 'fixed'),
  ...seedGroup(LIFESTYLE, 'lifestyle'),
  ...seedGroup(INCOME, 'income'),
  ...seedGroup(TRANSFER, 'transfer'),
  ...seedGroup(CREDIT_CARD, 'credit card'),
  // Family applied last so `sachin` (also present in the Income list) resolves to `family`.
  ...seedGroup(FAMILY, 'family'),
}

export function categorize(norm: string, overrides?: Record<string, string>): string {
  return overrides?.[norm] ?? SEED_CATEGORIES[norm] ?? 'uncategorized'
}
