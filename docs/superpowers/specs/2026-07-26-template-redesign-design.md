# Template redesign + theme switching — design

Date: 2026-07-26
Status: approved (user, this session)
Reference mock: `docs/finance-planner.html` (bundler-packed single-file mock; source
of truth for the visual language and the Overview/Budget/Trends layouts).

## Goal

Rebuild the app shell and the Overview, Budget, and Trends screens to match the
reference template's structure and visual language; reskin the remaining six
screens to the same language; add a Light/Dark/System theme toggle. All data
stays real (parsed Sambathikam sheet) — the template's synthetic data generator
is discarded.

## Decisions (locked with user)

1. **Shell**: top header + tab strip for all 9 screens. Sidebar and bottom nav
   are removed. Month pills global.
2. **Theme**: 3-way Light/Dark/System toggle, persisted, charts follow app
   theme.
3. **Scope**: Overview/Budget/Trends rebuilt to template layouts; Net worth,
   Sachin, Trips, Logs, Goals, Parser Health keep structure, reskinned.
4. **Approach**: token swap + shared primitives; incremental, tests stay green.

## 1. Theme system

- `ThemeMode = 'light' | 'dark' | 'system'`; persisted at
  `localStorage['fp.theme']`; default `system`.
- A small `theme.ts` module + `ThemeContext` own: mode, resolved scheme
  (`light|dark`), setter. Resolution: `system` → `matchMedia
  ('(prefers-color-scheme: dark)')` with change listener (listener active only
  in system mode); otherwise the explicit mode.
- Resolved scheme is stamped as `data-theme="dark|light"` on
  `document.documentElement`. Pre-React inline snippet in `index.html` stamps
  it before first paint (no flash).
- `app.css`: all tokens defined under `:root[data-theme='dark']` and
  `:root[data-theme='light']`; existing `@media (prefers-color-scheme: dark)`
  blocks removed. Fallback (no attribute) = dark values.
- `useColorScheme` reworked to read ThemeContext's resolved scheme so recharts
  palettes follow the toggle. `palette.ts` gains the new template colors for
  both schemes.
- Toggle UI: 3-state segmented control in the header (icons: sun / moon /
  monitor), keyboard accessible.

## 2. Design language (tokens)

Dark (template-exact):

| token | value |
| --- | --- |
| bg | `#0a0b0d` |
| panel | `#101115` |
| panel-inset (expanded rows, totals) | `#0c0d10` / `#0d0e12` |
| border | `#1e2026` |
| row-border | `#16181d` |
| text | `#e8e8ea` |
| text-secondary | `#a9abb4` |
| muted | `#8b8d96` |
| faint | `#65676e` / `#5c5e66` |
| green | `#5ec98a` (dark fill `#4f9d76`) |
| red | `#d8705e` |
| brick (debt bars) | `#a8604f` |
| blue | `#7fb7ff` |
| amber | `#c9a45e` |
| track (meter bg) | `#1a1d23` |

Category dot palette (from template): brick `#a8604f`, blue `#7fb7ff`, purple
`#8f7fc4`, green `#5ec98a`, amber `#c9a45e`, cyan `#5eb8c9`, pink `#c95e93`,
olive `#9ab05e`, gray `#6c7180`, mauve `#b07a9a`, teal `#78c9b4`. Assigned to
categories deterministically (stable order by category key).

Light: same hues, surfaces inverted — bg `#f6f6f4`, panel `#ffffff`, borders
`#e4e4e0`/`#ececea`, text `#1d1e22`, muted `#6b6d75`; accent hues darkened
enough for AA contrast on white (e.g. green `#2e7d54`, red `#b8503e`, blue
`#2a6fc0`, amber `#9a7728`). Exact values validated during implementation
against WCAG AA for text-size usage.

Typography: numbers and codes in `'IBM Plex Mono'` (weights 400/500/600) via
`@fontsource/ibm-plex-mono` — self-hosted, bundled by Vite, no CDN (GitHub
Pages, offline cache friendly). Body stays on the system/Helvetica stack.
Utility class `.num` applies the mono stack; all amount cells use it.

Density: 13px base, 10.5px uppercase tracking labels, 6–8px meters, 10px
radius panels, 1px row borders — per template.

## 3. Shell

Replaces `Layout.tsx` chrome (sidebar + bottomnav die; `Layout.tsx` rewritten,
registry untouched).

- **Header**: kicker `FINANCE PLANNER`; selected-month long title (e.g. `Jul
  2026`); mono headline `€X in · €Y out · +€Z saved` for the selected month;
  right: tab strip + theme toggle.
- **Tab strip**: all 9 screens as template-style pills in a bordered container;
  Parser Health tab keeps issue-count badge. Overflow: horizontal scroll on
  narrow viewports.
- **Month pills**: single global row (`MMM'YY` mono pills) under the header —
  last 12 months by default with a `‹ older` affordance to page back (103 tabs
  exist; pills stay one row). Selected month is app-level state (React state in
  App.tsx, not persisted), passed to screens via existing `ScreenProps`
  (`selectedPeriod` added). Screens that already have their own month notion
  (Budget/Trends month pickers) drop it in favor of the global one; screens
  where months are irrelevant (Sachin, Trips, Goals, Health) ignore it.
- **Responsive**: KPI grid 7→4→2 columns; Overview 3-col → 1-col; tab strip and
  month pills scroll horizontally. Bottom nav is gone on mobile too (tabs
  scroll).

## 4. KPI row

Seven cards, template layout (label / mono value / delta vs prev month /
12-month sparkline with end dot / note):

1. Income (excl. carryover — see Deviations)
2. Expenses
3. Saved this month (income − expenses; color green/red; note shows vs target)
4. Cash available (bank accounts total)
5. Savings pot (savings-flagged accounts)
6. Upcoming to pay (red; from Upcoming block / credit-card bills)
7. Net worth (blue; note `incl. €X invested`)

Data assembled by a new pure lib `src/lib/kpis.ts` from existing libs
(`overviewFigures`, `carryover`, `networth`, `creditCardBills`, `trends`) —
unit-tested. Sparklines reuse `Sparkline.tsx`. Rendered on Overview, Budget,
Trends, Net worth; hidden on the other five screens.

Savings target: from existing Goals app-state (monthly savings goal) with a
sensible default when unset.

## 5. Screens

### Overview (rebuilt)

Template 3-column grid `1.35fr 1fr 1fr`:

- **Expenses by category** (col 1): header with total + category count; rows =
  category dot, name, item count, share-of-spend meter, actual, budget,
  variance (signed, colored). Row click expands inline item list (label +
  amount, zero-amount items dimmed as planned/unpaid). One open at a time.
- **Income sources** (col 2 top): grouped rows (Salary, Kindergeld, transfers,
  Paypal, Other — groups derived from normalized labels), share meter, amount;
  click expands items. Carryover shown as its own labeled row, visually
  separated, never in the income total.
- **Savings progress** (col 2 bottom): last 6 months, bar vs target, amount,
  rate; footer `Saved in last 6 months`.
- **Bank accounts** (col 3 top): rows name/kind/amount, footer `Available +
  savings` total.
- **Upcoming to pay** (col 3 bottom): total; coverage note (`Covered by cash +
  savings with €X to spare` / `Obligations exceed cash + savings by €X`, panel
  border tinted red when negative); rows grouped by provider (Advanzia, Amex,
  Sparkasse/Amazon, …) via existing alias normalization, expandable; share
  meter per provider. `Food Home` budget-tracker rows keep their special
  semantics (budget remaining, not a payable bill) — shown under a distinct
  label, excluded from "upcoming to pay" total (matches current
  `creditCardBills`/`foodHome` behavior).

### Budget (rebuilt)

Two columns `1.25fr 1fr`:

- **Budget vs actual**: per category — usage meter with % (green / amber >90%
  / red >100%), actual, budget, left (signed/colored), 6-mo avg (recomputed,
  never sheet F-block); totals row; header summary `€X under/over plan`.
- **All line items**: search input (label or category), count `n of m`,
  scrolling dense list (label / category / amount, planned items dimmed).

Budgets come from the existing budget source (`budgetActuals` /
MONTHLY_PLAN + app-state category budgets) — unchanged semantics.

### Trends (rebuilt)

- **Net worth & cash chart**: 12 months, three series (net worth blue, cash
  green, card debt brick), horizontal gridlines, hover column tooltip
  (month + all series + saved), click column selects that month globally.
  Implemented with the existing chart stack restyled to template colors; raw
  SVG only if recharts can't match the look.
- **Month by month table**: income, expenses, saved (signed/colored), rate,
  cash, card debt, net worth, top category; selected-month row highlighted;
  row click selects month.
- **Category trend**: per category — dot, name, 12-mo sparkline, this month,
  6-mo avg, vs avg (signed, red=above avg for expenses).

### Other six screens

Net worth, Sachin, Trips, Logs, Goals, Parser Health: structure and logic
untouched; visual pass only (new tokens apply automatically via restyled
shared CSS; spot-fix any hardcoded colors; amounts get `.num`).

## 6. Shared primitives

- `Panel` (header row: title + mono meta; body) — or CSS-only classes if a
  component adds no value.
- `DataGrid` CSS patterns: uppercase tracking column headers, 1px row borders,
  right-aligned mono amount cells, hover row, expandable inset section.
- `KpiCard`, `BarMeter` (share/usage bars), `Sparkline` (exists).
- All in `src/ui/shared.tsx` + `app.css`; no new dependencies beyond
  `@fontsource/ibm-plex-mono`.

## 7. Deviations from template (intentional)

1. **Carryover is not income** (repo golden rule). Template's income total and
   headline include carryover; ours exclude it everywhere. Carryover appears
   as a separate labeled row/note.
2. **KPI row hidden** on Sachin/Trips/Logs/Goals/Health (template always shows
   it; noise there).
3. **Real parsers/libs feed everything**; template's `month(i)` jitter
   generator and hardcoded JUL_26 data are reference-only.
4. **Existing € formatting conventions kept** (current app formatter).
5. **Fonts self-hosted** via fontsource, not Google Fonts CDN.
6. **Recharts kept** where it can match the look; template's hand-rolled SVG
   adopted only for sparklines/meters.

## 8. Error/edge handling

- Missing special tabs (plan, banks, funds): KPI cards render `—` with an
  explanatory note; panels show existing EmptyState pattern. Never crash.
- Months with no data (auth expired, cache cold): month pills disabled beyond
  available range.
- Unparseable/unknown categories flow to Parser Health as today; "Other"
  bucket renders last with gray dot.
- Theme: localStorage unavailable → in-memory mode, default system.

## 9. Testing

- Existing suites must stay green throughout (lib/parser code untouched except
  additive).
- New unit tests (TDD): `theme.ts` (persist/resolve/system fallback),
  `kpis.ts` (assembly incl. carryover exclusion, missing-data `—` cases),
  income grouping, provider grouping reuse, month-pill windowing (last 12 +
  paging).
- Component smoke tests where the repo already has them; visual verification
  via dev server in both themes at desktop + mobile widths.

## 10. Out of scope

- No new data sources or parser changes.
- No restructuring of the six reskinned screens.
- No routing changes (screen switching stays state-based).
- Template's `monthlySavingsTarget`/`subtleAlerts` prop editors: covered by
  existing Goals state; no new settings UI.
