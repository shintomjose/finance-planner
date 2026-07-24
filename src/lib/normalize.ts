// Label normalization + category seed map, built from
// .claude/skills/finance-planner/workbook-map.md section "4. Labels — category-map seed".
//
// Compound entries in the source doc are split into individual labels; case/variant
// notation (e.g. `DM/dm`, `rewe/Rewe`) collapses to a single normalized key.
// `sachin` and `revolut` appear in both the Family and Income label lists — since
// SEED_CATEGORIES is a flat map, each key can only hold one category. Per project
// decision: `sachin` -> family, `revolut` -> income, `n26` -> family.

export function normLabel(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toLowerCase()
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
  'Amazon CC',
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

export const SEED_CATEGORIES: Record<string, string> = {
  ...seedGroup(GROCERIES, 'groceries'),
  ...seedGroup(FIXED, 'fixed'),
  ...seedGroup(LIFESTYLE, 'lifestyle'),
  ...seedGroup(INCOME, 'income'),
  ...seedGroup(TRANSFER, 'transfer'),
  // Family applied last so `sachin` (also present in the Income list) resolves to `family`.
  ...seedGroup(FAMILY, 'family'),
}

export function categorize(norm: string, overrides?: Record<string, string>): string {
  return overrides?.[norm] ?? SEED_CATEGORIES[norm] ?? 'uncategorized'
}
