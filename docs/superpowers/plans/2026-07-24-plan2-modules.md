# Finance Planner — Plan 2: Special Sheets + Full UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement task-by-task. Steps use checkbox syntax.
> **REQUIRED CONTEXT:** Load `finance-planner` skill; workbook-map.md §2 is the coordinate authority for every special-sheet parser. UI tasks: invoke the `dataviz` skill before writing chart code and `frontend-design` before the design-system task.

**Goal:** All spec-§5 modules live: special-sheet parsers (MONTHLY_PLAN, MUTUAL FUNDS, DEUTSCHE BANK, BINANCE/UPSTOCS, SACHIN, INDIA_2023) + Budget vs Actual, Trends, Net worth, Sachin, Trips, Logs, Goals & Recurring screens with charts, plus app-owned state (category map, FX, goals) and the review-backlog hygiene items.

**Architecture:** Extends Plan 1 pipeline. Special tabs fetched via existing cross-tab batching (live set, TTL), parsed by per-block parsers into new domain types, cached under CACHE_SCHEMA_VERSION 2. Charts: **recharts** (decision locked). App-owned state in localStorage with JSON export/import. Never-throw/ParserIssue contract unchanged.

**Tech Stack:** as Plan 1 + recharts (only new dep).

## Global Constraints

- Parsers never throw; unparsed → ParserIssue. Locate variable blocks by label/header text, never fixed rows (INDIA_2023 trips, MUTUAL FUNDS scaffold rows).
- No real financial data in repo — synthetic fixtures mirroring workbook-map §2 coordinates.
- TS strict; every task green: `npm run typecheck && npm test`. Commits one line `<type>(FP): <subject>`.
- `spreadsheets.readonly` only. No new deps beyond recharts.
- Existing 79 tests stay green (adapt only with recorded rationale).
- Special-tab names with spaces quoted in ranges: `'MUTUAL FUNDS'!A1:X42`.

## File structure (added by Plan 2)

```
src/types.ts                    # + Budget, InvestmentSnapshot, PersonLedger, Trip, LogEntry, SpecialData; ParserIssue.kind → union
src/parse/monthlyPlan.ts        # budget plan, loan, SBI, projection params, petrol/gym/gear/alcohol logs, UPSTOCS
src/parse/mutualFunds.ts        # fund column-groups
src/parse/deutscheBank.ts       # products + payment matrix + valuations
src/parse/binance.ts            # ledger + P/L
src/parse/sachin.ts             # ledger, repayments, EMIs
src/parse/indiaTrips.ts         # dynamic trip-header scan
src/data/specialTabs.ts         # ranges per special tab + fetch/parse/cache orchestration (schema v2)
src/state/appState.ts           # localStorage: category overrides, FX rate, goals, recurring confirmations + JSON export/import
src/lib/recurring.ts            # cadence detection over month history
src/lib/carryover.ts            # recomputed chain + drift vs sheet
src/ui/Layout.tsx               # nav (9 modules), theme, shared components (Section, StatCard, Money)
src/ui/charts/*                 # shared recharts wrappers (CategoryLine, PacingBar, Donut…)
src/ui/screens/{Budget,Trends,NetWorth,Sachin,Trips,Logs,Goals}.tsx
tests/fixtures/{MONTHLY_PLAN,MUTUAL_FUNDS,DEUTSCHE_BANK,BINANCE,SACHIN,INDIA_2023}.json
tests/*.test.ts per parser + state + recurring + carryover
```

---

### Task 1: Hygiene backlog

**Files:** Modify `src/types.ts`, `src/ui/App.tsx`, `src/api/gis.ts`, `src/data/orchestrator.ts`, `.github/workflows/ci.yml`, `tsconfig.json`(+new `tsconfig.test.json`)

- [ ] ParserIssue.kind → string-literal union (`'bad-number'|'ref-error'|'missing-formula'|'marker-not-found'|'dropped-row'|'unknown-tab'|'missing-current-month'|'fetch-failed'` + Plan 2 kinds as added). Fix any literals that no longer compile.
- [ ] Silent re-auth: on AuthExpiredError, one silent `requestAccessToken({prompt:''})` attempt before falling back to SignIn screen.
- [ ] cachedBanner: fire only when the DISPLAYED month's tab has a fetch-failed/cache-served-stale condition, banner text "some data unavailable / showing cached data" accordingly.
- [ ] putCached failures separated from fetch failures (own try; issue kind `'cache-error'`).
- [ ] CI: `concurrency: {group: pages, cancel-in-progress: false}` on deploy; skip artifact upload on PRs.
- [ ] tests/ typechecked: `tsconfig.test.json` (extends app config, includes tests/) wired into `tsc -b`.
- [ ] TDD where logic changes (re-auth flow, banner logic, cache-error) — mock-level tests.
- [ ] Commit: `fix(FP): plan1 review backlog hygiene`

### Task 2: Domain types v2 + special-tab fetch layer

**Files:** Modify `src/types.ts`, `src/cache/db.ts` (CACHE_SCHEMA_VERSION → 2), Create `src/data/specialTabs.ts`, `tests/specialTabs.test.ts`

**Interfaces (Produces):**
```ts
export const SPECIAL_TABS = {
  MONTHLY_PLAN:   { range: "MONTHLY_PLAN!A1:R170" },
  MUTUAL_FUNDS:   { range: "'MUTUAL FUNDS'!A1:X45" },
  DEUTSCHE_BANK:  { range: "'DEUTSCHE BANK'!A1:N95" },
  BINANCE:        { range: "BINANCE!A1:G30" },
  SACHIN:         { range: "SACHIN!A1:J340" },
  INDIA_2023:     { range: "INDIA_2023!A1:K300" },
} as const
export type SpecialTabKey = keyof typeof SPECIAL_TABS
export interface SpecialGrids { values: (string|number|null)[][] }   // no formula grid needed
export async function loadSpecialTabs(client: SheetsClient, now: Date): Promise<{ grids: Map<SpecialTabKey, SpecialGrids>, issues: ParserIssue[] }>
// live TTL same LIVE_TTL_MS; cached under key `special:<KEY>`; schema v2 invalidates all v1 entries (auto-refetch, no migration)
```
- [ ] SheetsClient: add `fetchRanges(ranges: string[], render?: 'UNFORMATTED_VALUE'|'FORMULA'): Promise<(JsonValue[][]|null)[]>` generic (one batchGet; positional) — special tabs = ONE HTTP call for all six.
- [ ] Types: `Budget {category, plannedMonthly}`, `InvestmentSnapshot {date: string|null, source: 'db'|'mf'|'binance'|'upstocks'|'bank', asset, investedEUR?, valueEUR?, investedINR?, valueINR?}`, `PersonLedger {name, entries: {date: string|null, label: string, amountEUR: number|null, row: number}[], repayments: […], emis: {name, rows: […]}[], totals: {given, repaid, remaining}}`, `Trip {name, totalINR, entriesINR[], entriesEUR[], iciciSplitINR: number|null}`, `LogEntry {log: 'petrol'|'gym'|'gear'|'alcohol', date: string|null, fields: Record<string, number|string|null>}`.
- [ ] TDD: fetchRanges positional test; loadSpecialTabs cache/TTL tests (fake-indexeddb, patterned on orchestrator tests); v1-entry invalidation test.
- [ ] Commit: `feat(FP): special-tab fetch layer and domain types v2`

### Task 3: MONTHLY_PLAN parser + fixture

**Files:** Create `src/parse/monthlyPlan.ts`, `tests/fixtures/MONTHLY_PLAN.json`, `tests/monthlyPlan.test.ts`

Blocks per workbook-map §2.1 (synthetic fixture mirrors ALL coordinates): budget plan A1:D27 → `Budget[]` + totals (+issue if labeled row unparsable); Commerzbank loan I1:J45 → `{principal, installments[], paidToDate}`; savings snapshots K1:N7; 2035 projection K11:R26 → extract `{ratePct, yearlyContribution, rows[]}` (recompute happens UI-side); SBI Life A29:D63 → schedule[]; badminton gear F30:G64 + L50:N62, gym H48:J74, petrol F81:K153, alcohol A126:C161 → `LogEntry[]` each (mixed date formats → best-effort ISO or null + issue kind `'bad-date'` only when cell non-blank and unparseable); UPSTOCS A97:C123 → `InvestmentSnapshot[]`; Binance copy A65:C95 SKIPPED (BINANCE tab is source of truth).
- [ ] Fixture: synthetic values at exact coordinates; include one bad date, one text-concat subtotal string cell (must be ignored, no issue where map says string block), pre-numbered empty scaffold rows in a log (must not count).
- [ ] TDD per block (RED first); every block parser separate function; issues carry cell refs.
- [ ] Commit: `feat(FP): monthly_plan parser`

### Task 4: MUTUAL FUNDS parser + fixture

**Files:** Create `src/parse/mutualFunds.ts`, `tests/fixtures/MUTUAL_FUNDS.json`, `tests/mutualFunds.test.ts`

Column groups per workbook-map §2.2 (Quant A–D SIP, JM E–G, PGIM H–J, 360One K/L, SBI M/N sold, AdityaBirla O/P lump, SBI-PSU Q/R sold, HDFC S/T, Motilal U/V, Invesco W/X lump). Output `InvestmentSnapshot[]` (source 'mf', INR) + summary from M39:N42 `{investedINR, currentINR, pctChange}`. Scaffold rows (running number, no data) skipped without issue; sold funds flagged via `asset` suffix or field `sold: true` (add optional field to InvestmentSnapshot).
- [ ] TDD; fixture has scaffold rows + one sold fund.
- [ ] Commit: `feat(FP): mutual funds parser`

### Task 5: DEUTSCHE BANK parser + fixture

**Files:** Create `src/parse/deutscheBank.ts`, `tests/fixtures/DEUTSCHE_BANK.json`, `tests/deutscheBank.test.ts`

Products A2:C10 (name, monthly EUR); payment matrix E2:N91 — per-payment rows (#, date, per-product amounts), G91 grand total; sporadic valuations col I → `InvestmentSnapshot[]` (source 'db', EUR, latest per product); per-product sums row 91 cross-check: recompute vs row 91, mismatch → issue kind `'sum-drift'` (tolerance 0.01).
- [ ] TDD; fixture includes one intentional drift row to exercise `'sum-drift'`.
- [ ] Commit: `feat(FP): deutsche bank parser`

### Task 6: BINANCE + SACHIN + INDIA_2023 parsers + fixtures

**Files:** Create `src/parse/binance.ts`, `src/parse/sachin.ts`, `src/parse/indiaTrips.ts`, 3 fixtures, 3 test files

- BINANCE (map §2.4): header row 2, rows 3+ until blank streak; running-total D, spot F, P/L G → `InvestmentSnapshot[]` (source 'binance', EUR) + `{netInEUR, currentEUR}`.
- SACHIN (map §2.5): ledger B2:C336 (dates col A appear ~row 122 — date optional), repayments F133:G189, EMIs H/I/J blocks located by their header labels (iPhone-13, iPhone 14, Fridge, Washing Machine), totals G131/G132 read + recomputed (drift → `'sum-drift'`). Output `PersonLedger`.
- INDIA_2023 (map §2.6): scan whole grid for trip headers BY TEXT (date-like header + total cell), never fixed rows; per trip ₹ ledger + € ledger + ICICI col. Output `Trip[]`. Fixture: 2 synthetic trips at DIFFERENT rows than real sheet (proves dynamic scan).
- [ ] TDD each (RED first). Mixed/ambiguous dates → `'bad-date'` issue only when non-blank unparseable; day/month-swap heuristic: if day>12 unambiguous, else prefer DD-MM (sheet's dominant format), flag `'ambiguous-date'` issue only when both plausible AND month boundary crossed... simpler binding rule: parse DD-MM-YYYY / DD.MM.YYYY / serial numbers; ambiguous MM/DD forms → take DD-MM, no issue (documented).
- [ ] Commit each parser separately: `feat(FP): binance parser` / `feat(FP): sachin parser` / `feat(FP): india trips parser`

### Task 7: App state + carryover + recurring libs

**Files:** Create `src/state/appState.ts`, `src/lib/carryover.ts`, `src/lib/recurring.ts`, tests for each

- appState: localStorage-backed `{categoryOverrides: Record<string,string>, fxRate: number (default 100), goals: Goal[], recurringConfirmed: string[]}`; `exportJSON()`/`importJSON(text)` (validate shape, reject garbage); versioned key `fp-state-v1`. `Goal {id, name, targetEUR, targetDate?, note?}`.
- carryover: `computeChain(months: MonthData[]): {tab, computed, sheet: number|null, driftEUR: number|null}[]` — computed = prev.computed + income − expense (start: earliest month's sheet carryover ?? 0); drift = sheet-carryover − computed-prev.
- recurring: `detectRecurring(months): {normLabel, category, medianAmount, cadence: 'monthly'|'sporadic', hitRate, lastSeen}[]` — label recurs ≥6 of trailing 12 months → monthly candidate.
- [ ] TDD all three (pure logic — fixture months built inline).
- [ ] Commit: `feat(FP): app state, carryover chain, recurring detection`

### Task 8: Layout + design system + recharts

**Files:** Create `src/ui/Layout.tsx`, `src/ui/charts/` wrappers, rework `src/ui/app.css`, modify `App.tsx`; `npm i recharts`

- [ ] IMPLEMENTER MUST invoke `frontend-design` skill and `dataviz` skill first; follow dataviz palette/mark rules for chart wrappers (CategoryLine, MonthBar, PacingBar, Donut, Sparkline) — theme-aware (light/dark), one palette system, no per-screen ad-hoc colors.
- [ ] Nav: 9 modules (Overview, Budget, Trends, Net worth, Sachin, Trips, Logs, Goals, Parser Health) — mobile bottom-nav / desktop sidebar; screens lazy-loaded (`React.lazy`) to keep initial bundle lean.
- [ ] Shared: `Money` (de-DE EUR + optional ₹ with fxRate), `StatCard`, `Section`, empty/loading states.
- [ ] Existing Overview restyled into system (no logic change).
- [ ] Verify: typecheck+tests+build; visual check via `npm run dev` best-effort.
- [ ] Commit: `feat(FP): layout, design system, and chart primitives`

### Task 9: Budget vs Actual screen

**Files:** Create `src/ui/screens/Budget.tsx` (+ hook `src/data/useAppData.ts` if needed)

MONTHLY_PLAN Budget[] vs current month's categorized actuals (categorize(normLabel, overrides)); per-category PacingBar ("spent X of Y at Z% of month"); surplus tracking vs plan; unbudgeted-category spill list. Month selector (current default).
- [ ] Logic in pure helper `budgetActuals(months, budget, overrides, now)` with TDD; component thin.
- [ ] Commit: `feat(FP): budget vs actual screen`

### Task 10: Trends screen

**Files:** Create `src/ui/screens/Trends.tsx`, helper `src/lib/trends.ts` + tests

`trends.ts` (TDD): monthly totals series; per-category monthly series (top N + rest); YoY same-month deltas; top movers (category Δ vs trailing-3-month avg); household vs rest split; carryover drift series (from carryover.ts). Screen: CategoryLine multi-series, YoY bar, movers list, drift table (drift ≠ 0 highlighted).
- [ ] Commit: `feat(FP): trends screen`

### Task 11: Net worth screen

**Files:** Create `src/ui/screens/NetWorth.tsx`, helper `src/lib/networth.ts` + tests

Aggregate: bank totals (latest month), DB valuations, MF summary (INR→EUR via fxRate), Binance current, UPSTOCS latest. Cards + composition Donut + per-source P/L. 2035 projection: recompute from parsed params with editable rate/contribution (inputs, defaults from sheet); line chart projected vs sheet's original.
- [ ] `networth.ts` pure + TDD (fx conversion, aggregation, projection math `FV = Σ contributions compounded`).
- [ ] Commit: `feat(FP): net worth and investments screen`

### Task 12: Sachin + Trips + Logs screens

**Files:** Create `src/ui/screens/{Sachin,Trips,Logs}.tsx`, helper tests where logic exists

- Sachin: given/repaid/remaining StatCards (recomputed + sheet w/ drift note), ledger table (virtualless — 336 rows fine), EMI progress bars.
- Trips: per-trip cards (₹ total, € pre-travel, ICICI split), expandable ledgers.
- Logs: petrol — €/L line + consumption (L/100km where km present) + fills table; gym — €/visit trend; gear totals €+₹; alcohol total (small).
- [ ] Chart data helpers TDD'd (petrol per-litre series, gym visit cost).
- [ ] Commit: `feat(FP): sachin, trips, and logs screens`

### Task 13: Goals & Recurring screen + category map editor

**Files:** Create `src/ui/screens/Goals.tsx`, category editor section (in Goals screen or Settings area of Layout)

- Recurring: detectRecurring list; confirm/dismiss (persist recurringConfirmed); upcoming-recurring estimate for current month.
- Goals: CRUD on appState.goals; feasibility = target ÷ months-remaining vs avg free cash flow (trailing 6 months income−expense); progress vs linked saving trend (v1: manual current-amount field).
- Category map editor: table of top uncategorized normLabels (by frequency) + dropdown assign → categoryOverrides; export/import JSON buttons (appState).
- [ ] Helpers TDD'd (feasibility math, uncategorized ranking).
- [ ] Commit: `feat(FP): goals, recurring, and category editor`

### Task 14: Wire-up, Parser Health v2, final verification

**Files:** Modify `App.tsx`/`Layout.tsx` data flow, `ParserHealth.tsx`

- Single `useAppData` hook: months + special tabs + appState down through Layout; loading states per source.
- Parser Health v2: group by sheet, kind filter, count badges per module source, "copy report" button.
- Full `npm run typecheck && npm test && npm run build`; bundle-size note (lazy chunks).
- [ ] Commit: `feat(FP): app wiring and parser health v2`

---

## Self-review notes

- Spec §5 coverage: modules 1–9 all present (1 Overview done Plan 1, 2→T9, 3→T10, 4→T11, 5→T12, 6→T12, 7→T12, 8→T13, 9→T14). App-owned state (spec §4) → T7/T13. Charts decision → recharts (T8). Carryover drift display (spec §3.1) → T10.
- Interface consistency: SpecialGrids/loadSpecialTabs (T2) consumed T3–T6; appState (T7) consumed T9/T13; parsers' outputs typed in T2's domain types.
- Era/fixture policy: every special-sheet fixture synthetic at real coordinates; INDIA fixture deliberately offset rows to prove dynamic scan.
- Deferred consciously: PWA/offline banner polish, virtualized tables, automatic FX API (spec §9 out of scope).
