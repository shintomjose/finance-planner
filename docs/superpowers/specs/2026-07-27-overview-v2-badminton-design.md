# Overview v2 + Badminton screen — design spec (2026-07-27)

Owner-requested batch on top of the 2026-07-26 template redesign. Approved in
chat 2026-07-27; cell semantics verified against the live JUL_26 tab.

## 1. Month parser: bank-scratch capture

`MonthData` gains optional `scratch?: ScratchEntry[]`:

```ts
interface ScratchEntry { label: string; normLabel: string; amountEUR: number; block: 'IJ' | 'KL'; row: number }
```

- **IJ block:** rows below the bank `Total` row (located by label, per parser
  rules) to `BANK_LAST_ROW`: capture rows where I is a non-blank label AND J is
  a plain number. `Expected-Actual` / `Balance After future Expense` rows are
  excluded (already dedicated fields).
- **KL block:** rows 2..`BANK_LAST_ROW`: label in K, plain number in L.
- **Deliberate exception to "never silently drop":** these are the free-form
  scratch areas workbook-map.md marks "ingest as notes only". Non-numeric /
  blank / `#REF!` cells are skipped silently with NO ParserIssue — issuing on
  free-form scratch would flood Parser Health with noise. Only label+number
  pairs are captured.
- Old eras simply produce an empty/absent scratch list.

Verified live labels (JUL_26): IJ `Current Amazon` J13, `Current Advancia`
J14, `Amex` J17, `Sachin` J18; KL `SACHIN` L18.

## 2. normalize.ts ALIASES additions

`'advancia cc' → 'advanzia'`, `'advanzia cc' → 'advanzia'`, `'amex cc' →
'amex'` (same convention as existing `'amazon cc' → 'sparkasse'`). Side
effect (intended fix): the `Advancia CC` / `Amex CC` expense rows finally land
in the `credit card` category (they were `uncategorized` — exact-match
`categorize` never saw them), so the Credit-card panel and category breakdown
become correct.

## 3. New lib `src/lib/cardDues.ts`

`cardDues(month, sachinRemaining)` → 4 rows (owner formulas, cell refs are
JUL_26 documentation only — lookups are label-based):

| Row | Formula | JUL_26 cells |
| --- | --- | --- |
| Advanzia | scratch IJ (`/advan[cz]ia/` + `/current/`) − Σ expenses normLabel `advanzia` | J14 − D6 |
| Amazon (Sparkasse) | scratch IJ (`/amazon/` + `/current/`) − Σ normLabel `sparkasse` | J13 − D15 |
| Amex | scratch IJ normLabel `amex` (exact) − Σ normLabel `amex` | J17 − D19 |
| Sachin | scratch KL `sachin` − ledger remaining − scratch IJ `sachin` | L18 − SACHIN!G132 − J18 |

- Sachin note always shows the two subtrahends: `(scratch €X · ledger
  remaining €Y)`.
- Any missing input → `due: null`, note names the missing piece. No clamping;
  Amex may legitimately go negative.
- `sachinRemaining` = `sachin.ledger.totals.remaining` (G132, trusted as-is).

## 4. New lib `src/lib/lifetimeTotals.ts`

`lifetimeTotals(months)`:
- `salaryEUR` = Σ income Tx `normLabel === 'salary'` across ALL months.
- `kgEUR` = Σ income Tx normLabel `'kg'` or `'kindergeld'`.
- `totalEUR` = salary + kg. INR display value = totalEUR × `appState.fxRate`.
- `householdAvg` = Σ per-month household ÷ months.length, where per-month
  household = `summary.household ?? Σ household-tagged expenses` (0 when
  neither exists — owner's formula divides by ALL months). `null` when
  months is empty.

`DEFAULT_STATE.fxRate` changes 100 → 92 (owner: 92 ₹/€; still editable in
Goals).

## 5. KPI row: 7 → 6 cards

- `saved` label → **This Month +/-**; `cash` label → **Total Savings +/-**.
- `savings` card REMOVED (`KpiId` union loses `'savings'`); `monthMetrics`
  keeps its `savings` field (net-worth math unchanged).

## 6. Overview screen changes

- **Hero band** (new, full width, above the grid): Total income till now
  (salary+KG, € big number + ₹ at fxRate below) · Monthly AVG household ·
  month count kicker. Template hero styling.
- **Column order:** col 1 = Income sources + Savings progress (moved to LHS),
  col 2 = Expenses by category, col 3 unchanged (Banks / Upcoming / Credit
  cards).
- **Upcoming to pay:** "Card & person dues" — the 4 computed rows — render
  first; upcoming items whose `categorize(normLabel(name))` is `credit card`
  are dropped from the bills list (double-count guard); other bills, Food
  budget row and footer stay. Coverage note now compares cash+savings against
  dues total + bills total. Panel total = dues + bills.
- **Category names uppercase** (CSS `text-transform`).
- **Style fixes:** Items/Share column spacing in the category grid; savings
  progress month label rendered `Jul '26` (not raw `JUL_26`) with fixed label
  column; vertical column dividers in all datagrid panels (`.dg-cols`,
  `.dg-row`, `.dg-foot` inner borders).
- Overview now receives `sachin` prop (for ledger remaining).

## 7. Badminton screen, Trips hidden

- `SCREEN_ORDER`: `trips` removed, `badminton` inserted in its slot. Trips
  screen code + registry entry kept (hide only).
- New `src/ui/screens/Badminton.tsx`: data = `plan.logs` entries with
  `log === 'gear'` (MONTHLY_PLAN badminton gear blocks — owner picked this
  source explicitly). The blocks carry NO dates, so no time axis: € items as
  BarMeter rows desc + total (1459.61 reference), ₹ block table
  (label/qty/₹/€ at fxRate) + totals. EmptyState when plan missing.

## 8. Testing

Pure-lib vitest (NODE env, no component tests): cardDues, lifetimeTotals,
scratch parsing (JUN_25 fixture extended with scratch rows), ALIASES
additions, kpis relabel/removal. Manual visual pass both themes.

## Non-goals

Trips deletion, NetWorth month-selection wiring, other deferred minors from
the redesign final review.
