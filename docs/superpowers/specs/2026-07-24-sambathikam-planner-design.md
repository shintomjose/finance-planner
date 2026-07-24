# Sambathikam Finance Planner — Design Spec

Date: 2026-07-24
Status: approved architecture (Option C), pending spec review

## 1. Summary

A personal finance planning + budget management web app for a single user (Shinto).
Static SPA hosted on **GitHub Pages** (this repo), reading the user's long-lived
**Google Sheet ("Sambathikam")** live via the Google Sheets API. Data entry stays
in Google Sheets — the app is a read-only dashboard, planner, and analytics layer.
No financial data is ever committed to this repository.

## 2. Decisions (locked)

| Decision | Choice |
| --- | --- |
| Architecture | **Option C** — live Google Sheets dashboard (rejected: GitHub-as-backend two-repo A′; browser-only B) |
| Data entry | Stays in Google Sheets, unchanged habits |
| Import scope | Everything active: month ledgers, MONTHLY_PLAN budget, investments (Deutsche Bank, Mutual Funds, Binance, UPSTOCS), SACHIN ledger, India trips, logs (petrol, gym, badminton gear) |
| Encryption | None needed — no data leaves Google; repo holds code only |
| Sheets scope | `spreadsheets.readonly` — app can never modify or corrupt the sheet |
| Hosting | GitHub Pages. Repo currently private → Pages needs GitHub Pro; making repo public is safe (code only) and free. Owner decides before deploy. |

## 3. Source workbook — reverse-engineered facts

Google Sheet exported as `Sambathikam.xlsx` (reference copy kept OUTSIDE this repo;
never commit it). 103 tabs: 91 monthly ledgers + 12 special sheets.

### 3.1 Monthly ledger tabs (91)

Names: `JAN`..`DEC` (= 2019), `JAN_20`..`JUL_26`. **No dates in cells — period
comes from the tab name only.** Five column blocks:

| Block | Range | Notes |
| --- | --- | --- |
| Income | `A2:B40` | label/amount EUR. `Last Month Balance` (A3; A4 in JAN-2019) is carryover, not income. `Salary` at A2. |
| Expenses | `C2:D80` | flat transaction list, label = category. D may contain inline arithmetic (`=18.99+3.99`); read UNFORMATTED_VALUE. D may be blank (planned, unpaid). |
| Summary | `F1:G9` | G1 total income, G2 total expense, G3 balance. Household = G6 (2019–2024) or G4 (2025+), computed as hand-picked `=D19+D20+…` sums — parse cell refs to tag household rows. |
| Bank balances | `I2:J~10` | account/EUR until row where I=`Total` (J6 `=SUM`), J7 `Expected-Actual`, J8 `Balance After future Expense`. Below = free-form scratch (INR banks, credit cards, debt lists) — ingest as notes only. |
| Upcoming expenses | `M2:O~55` | name/total/to-pay until row where M=`Total` (position varies — locate by label, never hardcode). |

Template eras: 2019 v1 (A–G only), 2019 v2 (+I/J, +M/N/O), 2020–2024 (full, F1:F9),
2025+ (`Expence` header, F block 5 rows, K/L/P scratch areas). Carryover cell B3
references previous month's `!J6`/`!J7`/`!G3`/`!J8` depending on era — the app
recomputes its own chain and shows drift instead of trusting formulas.

Volume: 4,306 expense rows total (avg 47/mo), 866 income rows. Labels are
inconsistent (`Enbw`/`EnBW`, `rewe`/`Rewe`) → case-insensitive normalization +
editable category mapping required.

### 3.2 Special tabs (active)

- **MONTHLY_PLAN** — dashboard of ~15 blocks. Key: budget plan `A1:D27`
  (income A2:A5, expense pairs B2:C25, totals A26/C27, surplus D2);
  Commerzbank loan amortization `I1:J45`; savings-till-2035 projection
  `K11:R26` (7.25% compounding); SBI Life schedule `A29:D63`; petrol log
  `F81:K153` (date/litre/amount/per-litre/km); gym log `H48:J74`; badminton
  gear `F30:G64` + `L50:N62`; alcohol log `A126:C161`; Binance summary
  `A65:C95`; UPSTOCS `A97:C123`; lifetime income G1 (cross-sheet sum of every
  month tab's B2).
- **MUTUAL FUNDS** — 10 funds as column pairs (SIP: date/amount + current-val
  col; lump: date/value snapshots). Totals row 38; summary M39:N42 (invested
  754,000 ₹ / current 708,699 / −6.01%). Pre-numbered empty scaffold rows must
  not count as data.
- **DEUTSCHE BANK** — product list A2:C10 (607.42 €/mo), monthly payment matrix
  E2:N91 (68 payments since 2020-07, G91 total 41,070 €), sporadic valuations
  col I, per-product sums row 91.
- **BINANCE** — deposit/withdraw ledger with running-total col D, current spot
  col F, P/L col G (row 24: net 1,462.76 deposited, 362 value).
- **SACHIN** — brother ledger B2:C336 (given 31,135.64 €), repayments F133:G189
  (29,650 €), remain G132 (cross-ref INDIA_2023!I19), EMI trackers in H/I/J
  (iPhone 13, iPhone 14, fridge, washing machine).
- **INDIA_2023** — 4 trips (Dec 2023, Apr 2024, Jul 2024, Feb 2025), each an
  ₹ in-India ledger + € pre-travel ledger + ICICI credit-card split column.
  New block per trip = parser must locate trip headers dynamically.

Dead/hidden (skip): BAPTISM, OTTO, INDIA SEP 19, ETC-OLD, most of ETC.

### 3.3 Recurring idioms the parser must handle

- Inline-arithmetic cells as itemized receipts.
- `ROUND(₹/rate,2)` FX conversions with hardcoded drifting rates (78→100 ₹/€).
- Text-concat subtotal cells (`… & " Total €: " & TEXT(SUM(...),"0.00")`) —
  string cells, not numbers.
- Mixed date encodings: real datetimes, `DD-MM-YYYY`, `DD.MM.YYYY`, month
  names, day/month-swap locale artifacts.
- Stale `#REF!` errors in old scratch areas.

## 4. Architecture

```
GitHub Pages (static, code only)
  └─ React + Vite + TypeScript SPA
       ├─ Auth: Google Identity Services token flow, scope spreadsheets.readonly
       │    GCP project in Testing mode, owner = only test user (no verification)
       ├─ Fetch: Sheets API v4 values.batchGet, UNFORMATTED_VALUE
       ├─ Cache: IndexedDB
       │    - historical month tabs = immutable → fetch once, cache forever
       │    - live set (current month, MONTHLY_PLAN, SACHIN, MUTUAL FUNDS,
       │      DEUTSCHE BANK, INDIA trips) → refresh on demand / staleness TTL
       ├─ Parser: per-era month parser + per-block special-sheet parsers
       │    → normalized domain model (below)
       ├─ App-owned state (NOT in sheet): category mapping, goals, recurring
       │    confirmations, FX rate override → localStorage + JSON export/import
       └─ UI modules (§5)
```

Normalized domain model:

- `Transaction {month, row, label, normLabel, category, amountEUR, kind: income|expense, flags: household|planned}`
- `MonthSummary {month, totalIncome, totalExpense, balance, carryover, bankAccounts[], upcoming[]}`
- `Budget {category, plannedMonthly}` (from MONTHLY_PLAN A1:D27)
- `InvestmentSnapshot {date, source: db|mf|binance|upstocks|bank, asset, investedEUR?, valueEUR?, investedINR?, valueINR?}`
- `PersonLedger {name: sachin, entries[], repayments[], emis[]}`
- `Trip {name, entriesINR[], entriesEUR[], iciciSplit}`
- `LogEntry {log: petrol|gym|gear|alcohol, date?, fields…}`

Config: spreadsheet ID + OAuth client ID in a `config.ts` (public repo safe —
client ID is public by design; spreadsheet ID alone grants no access under
readonly OAuth). FX ₹/€ rate: configurable, default latest.

## 5. UI modules (build order)

1. **Overview** — current month income/expense/balance, budget-pacing bars
   ("80% of food budget at 60% of month"), upcoming to-pay list, bank totals.
2. **Budget vs Actual** — MONTHLY_PLAN plan vs live month per category; monthly
   surplus tracking (plan 917.25 €/mo).
3. **Trends** — 2019→now: category lines, YoY same-month, top movers, monthly
   averages, household split.
4. **Net worth / Investments** — Deutsche Bank + Mutual Funds + Binance +
   UPSTOCS + bank balances; EUR+INR views; P/L per product; 2035 projection
   recomputed live with editable rate.
5. **Sachin** — given/repaid/remaining, EMI progress.
6. **Trips** — per-trip totals ₹/€, ICICI split.
7. **Logs** — petrol €/L trend + consumption, gym €/visit, gear totals.
8. **Goals & Recurring** — auto-detected recurring expenses (cadence detection
   over history), savings goals with feasibility vs average free cash flow.
9. **Parser Health** — every unparsed/unexpected cell listed; drift alarm when
   sheet structure changes. First-class screen, not a console log.

Mobile-first responsive; dark/light. Charts: lightweight (e.g. recharts or
uPlot) — decided in implementation plan.

## 6. Error handling

- Token expiry (1 h): silent re-prompt via GIS; cached data keeps UI usable.
- Offline: full read from IndexedDB cache, banner "showing cached data".
- Parser mismatch: never crash — route unparseable cells to Parser Health.
- Missing current-month tab (user hasn't created it yet): show last month +
  hint.
- `#REF!`/error cells: treated as null + logged to Parser Health.

## 7. Testing

- Parser unit tests against fixtures. Repo may become public → fixtures use
  SYNTHETIC data mirroring each era's exact shape (same coordinates, fake
  labels/amounts). The real Sambathikam.xlsx never enters this repo.
- Era coverage: JAN (2019 v1), AUG (2019 v2), JAN_22 (2020–24), JUN_25 (2025+).
- Special-sheet parser tests per block.
- Category normalizer tests (case merge, mapping).
- CI: GitHub Actions — typecheck, test, build, deploy to Pages.

## 8. Deliverables

1. This app (repo `finance-planner`, GitHub Pages).
2. Claude skill `finance-planner` in `.claude/skills/finance-planner/SKILL.md`
   — full workbook cell-map, parser rules, category map, app conventions,
   Sheets API patterns. Loaded for any work on this project.
3. Claude agent `finance-dev` in `.claude/agents/finance-dev.md` — project
   agent that always uses the skill.

## 9. Out of scope

- Writing to the Google Sheet (readonly forever until owner revisits).
- Multi-user, auth beyond Google OAuth, servers, databases.
- Dead tabs (BAPTISM, OTTO, INDIA SEP 19, ETC-OLD).
- Automatic FX rates from an API (manual/configurable rate only, v1).
