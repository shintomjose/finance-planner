# Finance Planner — Plan 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **REQUIRED CONTEXT:** Load the `finance-planner` skill and read `.claude/skills/finance-planner/workbook-map.md` before any parser task.

**Goal:** Working SPA: Google sign-in → fetch Sambathikam month tabs → parse all 4 eras → cached Overview of current month + Parser Health screen, deployed to GitHub Pages.

**Architecture:** React + Vite + TypeScript SPA. GIS token flow (readonly scope) → Sheets API v4 `values.batchGet` (UNFORMATTED_VALUE grids + targeted FORMULA ranges) → era-aware month parser → IndexedDB cache (historical tabs immutable) → minimal UI. All unparseable input becomes ParserIssue records, never crashes.

**Tech Stack:** React 18, Vite 5, TypeScript 5 (strict), Vitest + fake-indexeddb, GitHub Actions → Pages. No chart lib in this plan (CSS bars only).

## Global Constraints

- No real financial data in repo — fixtures SYNTHETIC, same coordinates as real eras (skill: fixture policy).
- OAuth scope exactly `https://www.googleapis.com/auth/spreadsheets.readonly`.
- Parsers never throw on bad input; emit `ParserIssue` instead.
- Commits: one line, `<type>(FP): <subject>`. Executor must have user's blanket approval for plan-task commits before first commit; otherwise propose message and wait.
- TypeScript `strict: true`; every task ends green: `npm run typecheck && npm test`.
- Locate variable-position rows by label (`Total`), never hardcoded row numbers in parser code.

## File structure (end state of Plan 1)

```
index.html  vite.config.ts  tsconfig.json  package.json
.github/workflows/ci.yml
src/config.ts            # sheetId + clientId + dead-tab list
src/types.ts             # domain model + ParserIssue
src/lib/period.ts        # tab name ↔ period, era detection
src/lib/normalize.ts     # label normalization + category seed map
src/parse/month.ts       # era-aware month-ledger parser
src/api/gis.ts           # Google Identity Services token flow
src/api/sheets.ts        # batchGet client + tab listing
src/cache/db.ts          # IndexedDB grid cache
src/data/orchestrator.ts # classify tabs, fetch+parse+cache
src/ui/App.tsx  src/ui/SignIn.tsx  src/ui/Overview.tsx  src/ui/ParserHealth.tsx
src/main.tsx  src/ui/app.css
tests/fixtures/*.json    # synthetic era grids
tests/*.test.ts
```

---

### Task 1: Scaffold + CI

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/ui/App.tsx`, `.github/workflows/ci.yml`, `.gitignore`

**Interfaces:**
- Produces: npm scripts `dev`, `build`, `typecheck` (`tsc --noEmit`), `test` (`vitest run`). Base path `/finance-planner/` for Pages.

- [ ] **Step 1: Scaffold**

```bash
npm create vite@latest . -- --template react-ts
npm i
npm i -D vitest fake-indexeddb @types/node
```

- [ ] **Step 2: Configure**

`vite.config.ts`:
```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/finance-planner/',
})
```

Add to `package.json` scripts: `"typecheck": "tsc -b --noEmit", "test": "vitest run"`.
(`-b` required: template tsconfig.json is solution-style with `files: []` + references — plain `tsc --noEmit` checks zero files and always passes.)
Ensure `tsconfig.json` has `"strict": true`.

`.github/workflows/ci.yml`:
```yaml
name: ci
on:
  push: { branches: [main] }
  pull_request:
permissions:
  contents: read
  pages: write
  id-token: write
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with: { path: dist }
  deploy:
    if: github.ref == 'refs/heads/main'
    needs: build
    runs-on: ubuntu-latest
    environment: { name: github-pages }
    steps:
      - id: d
        uses: actions/deploy-pages@v4
```

- [ ] **Step 3: Strip template cruft** — replace `App.tsx` with `export default function App(){ return <h1>Finance Planner</h1> }`, delete unused assets/css imports so typecheck is clean.

- [ ] **Step 4: Verify** — `npm run typecheck && npm test && npm run build` all succeed (vitest exits 0 with "no test files" is fine: pass `--passWithNoTests` in the script for now, remove in Task 2).

- [ ] **Step 5: Commit** — `chore(FP): scaffold vite react-ts app with CI to pages`

---

### Task 2: Domain types + period lib

**Files:**
- Create: `src/types.ts`, `src/lib/period.ts`, `tests/period.test.ts`

**Interfaces:**
- Produces:
```ts
// types.ts
export type Era = '2019v1' | '2019v2' | 'full' | 'v2025'
export interface Period { year: number; month: number } // month 1–12
export interface ParserIssue { sheet: string; cell?: string; kind: string; detail: string; raw?: unknown }
export interface Tx {
  tab: string; row: number; label: string; normLabel: string;
  amountEUR: number | null; kind: 'income' | 'expense';
  planned: boolean; household: boolean
}
export interface BankAccount { name: string; amountEUR: number }
export interface UpcomingItem { name: string; total: number | null; toPay: number | null }
export interface MonthSummaryCells { totalIncome: number | null; totalExpense: number | null; balance: number | null; household: number | null }
export interface MonthData {
  tab: string; period: Period; era: Era;
  income: Tx[]; expenses: Tx[]; carryover: number | null;
  summary: MonthSummaryCells; banks: BankAccount[]; bankTotal: number | null;
  expectedActual: number | null; balanceAfterFuture: number | null;
  upcoming: UpcomingItem[]; issues: ParserIssue[]
}
// period.ts
export function tabToPeriod(tab: string): Period | null   // 'JAN'→{2019,1}; 'JAN_22'→{2022,1}; unknown→null
export function eraOf(p: Period): Era
export function isMonthTab(tab: string): boolean
export function currentTabName(now: Date): string          // {2026,7}→'JUL_26'
```

- [ ] **Step 1: Write failing tests** (`tests/period.test.ts`)

```ts
import { describe, it, expect } from 'vitest'
import { tabToPeriod, eraOf, isMonthTab, currentTabName } from '../src/lib/period'

describe('tabToPeriod', () => {
  it('bare month name = 2019', () => expect(tabToPeriod('JAN')).toEqual({ year: 2019, month: 1 }))
  it('MMM_YY', () => expect(tabToPeriod('OCT_24')).toEqual({ year: 2024, month: 10 }))
  it('non-month tab', () => expect(tabToPeriod('MONTHLY_PLAN')).toBeNull())
})
describe('eraOf', () => {
  it('2019 v1 = JAN–MAY', () => expect(eraOf({ year: 2019, month: 5 })).toBe('2019v1'))
  it('2019 v2 = JUN–DEC', () => expect(eraOf({ year: 2019, month: 6 })).toBe('2019v2'))
  it('full = JAN_20–OCT_24', () => expect(eraOf({ year: 2024, month: 10 })).toBe('full'))
  it('v2025 = NOV_24+', () => expect(eraOf({ year: 2024, month: 11 })).toBe('v2025'))
})
it('isMonthTab', () => { expect(isMonthTab('FEB_21')).toBe(true); expect(isMonthTab('SACHIN')).toBe(false) })
it('currentTabName', () => expect(currentTabName(new Date(2026, 6, 24))).toBe('JUL_26'))
```

- [ ] **Step 2: Run, verify FAIL** — `npm test` → module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/period.ts
import type { Era, Period } from '../types'
const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']

export function tabToPeriod(tab: string): Period | null {
  const t = tab.trim().toUpperCase()
  const bare = MONTHS.indexOf(t)
  if (bare >= 0) return { year: 2019, month: bare + 1 }
  const m = /^([A-Z]{3})_(\d{2})$/.exec(t)
  if (!m) return null
  const mi = MONTHS.indexOf(m[1])
  if (mi < 0) return null
  return { year: 2000 + Number(m[2]), month: mi + 1 }
}
export const isMonthTab = (tab: string) => tabToPeriod(tab) !== null
export function eraOf(p: Period): Era {
  if (p.year === 2019) return p.month <= 5 ? '2019v1' : '2019v2'
  if (p.year < 2024 || (p.year === 2024 && p.month <= 10)) return 'full'
  return 'v2025'
}
export const currentTabName = (now: Date) =>
  `${MONTHS[now.getMonth()]}_${String(now.getFullYear() % 100).padStart(2, '0')}`
```

`src/types.ts`: exactly the interfaces from the Produces block above.

- [ ] **Step 4: Verify PASS** — `npm test` green; remove `--passWithNoTests`.
- [ ] **Step 5: Commit** — `feat(FP): domain types and month-tab period lib`

---

### Task 3: Label normalizer + category seed map

**Files:**
- Create: `src/lib/normalize.ts`, `tests/normalize.test.ts`

**Interfaces:**
- Produces:
```ts
export function normLabel(raw: string): string                   // trim, collapse ws, lowercase
export const SEED_CATEGORIES: Record<string, string>             // normLabel → category
export function categorize(norm: string, overrides?: Record<string, string>): string // fallback 'uncategorized'
```
Categories (fixed set for seed): `groceries, fixed, family, lifestyle, income, transfer`.

- [ ] **Step 1: Failing tests**

```ts
import { it, expect } from 'vitest'
import { normLabel, categorize, SEED_CATEGORIES } from '../src/lib/normalize'

it('normalizes case/whitespace', () => expect(normLabel('  EnBW  ')).toBe('enbw'))
it('merges case variants', () => expect(normLabel('Rewe')).toBe(normLabel('rewe')))
it('seed hit', () => expect(categorize(normLabel('Edeka'))).toBe('groceries'))
it('override wins', () => expect(categorize('edeka', { edeka: 'lifestyle' })).toBe('lifestyle'))
it('miss → uncategorized', () => expect(categorize('zzz-unknown')).toBe('uncategorized'))
it('seed covers top labels', () => {
  for (const l of ['rent', 'church', 'petrol', 'salary', 'sachin']) expect(SEED_CATEGORIES[l]).toBeDefined()
})
```

- [ ] **Step 2: Run, FAIL.**
- [ ] **Step 3: Implement** — `normLabel = raw.trim().replace(/\s+/g,' ').toLowerCase()`. Build `SEED_CATEGORIES` from workbook-map.md §4: every listed label, normalized, mapped to its group (Groceries→`groceries`, Fixed/recurring→`fixed`, Family→`family`, Lifestyle→`lifestyle`, Income→`income`; `last month balance`→`transfer`). ~60 entries, written out literally in the file.
- [ ] **Step 4: PASS.**
- [ ] **Step 5: Commit** — `feat(FP): label normalizer with category seed map`

---

### Task 4: Synthetic era fixtures

**Files:**
- Create: `tests/fixtures/JAN.json`, `tests/fixtures/AUG.json`, `tests/fixtures/JAN_22.json`, `tests/fixtures/JUN_25.json`, `tests/fixtures/README.md`

**Interfaces:**
- Produces: each fixture = `{ "values": (string|number|null)[][], "formulas": { "B3"?: string, "B4"?: string, "G4"?: string, "G6"?: string } }`. `values` is the grid of `A1:P100` (row-major, index 0 = row 1), UNFORMATTED_VALUE semantics. Fake labels/amounts, REAL coordinates per era (workbook-map §1).

- [ ] **Step 1: Build fixtures** (no test yet — fixtures are test data; correctness enforced by Task 5–7 tests). Shape requirements:
  - `JAN.json` (2019v1): income A2:B6 with `Salary` at A2=1000, carryover label `Last Month Balance` at **A4**=200; expenses C2:D10 (one blank D at row 6 → planned); summary F1:G9 2019 labels; **no** I/J, M/N/O blocks.
  - `AUG.json` (2019v2): same + banks I2:J5 with I5=`Total`, J5=1234.5, J6 `Expected-Actual`, J7 `Balance After future Expense`; upcoming M2:O6 with M6=`Total`.
  - `JAN_22.json` (full): carryover at A3/B3, `formulas.B3 = "=DEC_21!J8"`... **correction: JAN_22 era chain says `!J6`** → `"=DEC_21!J6"`; household `formulas.G6 = "=D3+D5"`; F1:F9 full labels; one expense D cell as string `"12,50"` (bad input → issue); one `#REF!` in J9.
  - `JUN_25.json` (v2025): header `Expence` at C1; summary 5 rows (G4 household, `formulas.G4="=D2+D4"`); G5 Monthly AVG present but must be ignored; upcoming Total at a different row than JAN_22.
- [ ] **Step 2: README.md** — one paragraph: synthetic policy, era each file covers.
- [ ] **Step 3: Commit** — `test(FP): synthetic month-ledger fixtures for all four eras`

---

### Task 5: Month parser — income + expenses blocks

**Files:**
- Create: `src/parse/month.ts`, `tests/month-income-expense.test.ts`

**Interfaces:**
- Consumes: `types.ts`, `period.ts`, `normalize.ts`, fixtures.
- Produces:
```ts
export interface MonthGrids { values: (string | number | null)[][]; formulas: Record<string, string> }
export function parseMonth(tab: string, grids: MonthGrids): MonthData
```
Internal helpers stay private. Cell access helper `cell(values, 'D19')` maps A1-notation → indices.

- [ ] **Step 1: Failing tests**

```ts
import { describe, it, expect } from 'vitest'
import { parseMonth } from '../src/parse/month'
import JAN from './fixtures/JAN.json'
import JAN_22 from './fixtures/JAN_22.json'

describe('income', () => {
  it('parses labels/amounts, excludes carryover', () => {
    const m = parseMonth('JAN_22', JAN_22 as any)
    expect(m.income.every(t => t.normLabel !== 'last month balance')).toBe(true)
    expect(m.carryover).toBe(200) // fixture value at B3
  })
  it('JAN-2019 carryover at row 4', () => {
    expect(parseMonth('JAN', JAN as any).carryover).toBe(200) // fixture B4
  })
})
describe('expenses', () => {
  it('blank amount → planned, amount null', () => {
    const m = parseMonth('JAN', JAN as any)
    const planned = m.expenses.find(t => t.planned)
    expect(planned).toBeDefined(); expect(planned!.amountEUR).toBeNull()
  })
  it('string amount → issue, not crash', () => {
    const m = parseMonth('JAN_22', JAN_22 as any)
    expect(m.issues.some(i => i.kind === 'bad-number' && i.cell?.startsWith('D'))).toBe(true)
  })
})
```

- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implement** — `parseMonth`: derive period+era (`tabToPeriod`/`eraOf`; null period → single issue + empty MonthData). Income scan rows 2–40 col A/B: skip fully empty rows; carryover row = normLabel `last month balance` (record B value → `carryover`, don't push Tx); non-numeric B → issue kind `bad-number`, amount null. Expense scan rows 2–80 col C/D: label present + D number → Tx; D null/'' → `planned: true, amountEUR: null`; D string → issue. `#REF!`/`#N/A` string values anywhere → value null + issue kind `ref-error`. All Tx get `normLabel` + `household:false` (Task 6 sets it).
- [ ] **Step 4: PASS.**
- [ ] **Step 5: Commit** — `feat(FP): month parser income and expense blocks`

---

### Task 6: Month parser — summary block + household tagging

**Files:**
- Modify: `src/parse/month.ts`
- Create: `tests/month-summary.test.ts`

**Interfaces:**
- Produces: `MonthData.summary` filled; expense Tx `household` flags set from household formula refs. Household cell: era `v2025` → G4, else G6 (2019v1/2019v2/full). Formula `=D19+D20+…` → rows 19,20…

- [ ] **Step 1: Failing tests**

```ts
import { it, expect } from 'vitest'
import { parseMonth } from '../src/parse/month'
import JAN_22 from './fixtures/JAN_22.json'
import JUN_25 from './fixtures/JUN_25.json'

it('summary cells read per era', () => {
  const m = parseMonth('JAN_22', JAN_22 as any)
  expect(m.summary.totalIncome).not.toBeNull()
  expect(m.summary.household).toBe((JAN_22 as any).values[5][6]) // G6
})
it('v2025 household at G4', () => {
  const m = parseMonth('JUN_25', JUN_25 as any)
  expect(m.summary.household).toBe((JUN_25 as any).values[3][6]) // G4
})
it('household rows tagged from formula refs', () => {
  const m = parseMonth('JAN_22', JAN_22 as any) // formulas.G6 = "=D3+D5"
  const hh = m.expenses.filter(t => t.household).map(t => t.row).sort()
  expect(hh).toEqual([3, 5])
})
it('missing household formula → issue, no crash', () => {
  const noF = { ...(JAN_22 as any), formulas: {} }
  const m = parseMonth('JAN_22', noF)
  expect(m.issues.some(i => i.kind === 'missing-formula')).toBe(true)
})
```

- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implement** — read G1/G2/G3 (+ household cell by era) as numbers (non-number → null + issue). Parse household formula with `/D(\d+)/g`; tag matching expense rows. Never read G5 `Monthly AVG` in v2025 (stale — recompute later in UI).
- [ ] **Step 4: PASS.**
- [ ] **Step 5: Commit** — `feat(FP): summary block parsing and household tagging`

---

### Task 7: Month parser — bank balances + upcoming blocks

**Files:**
- Modify: `src/parse/month.ts`
- Create: `tests/month-banks-upcoming.test.ts`

**Interfaces:**
- Produces: `banks`, `bankTotal`, `expectedActual`, `balanceAfterFuture`, `upcoming` filled; era `2019v1` → all empty, no issues.

- [ ] **Step 1: Failing tests**

```ts
import { it, expect } from 'vitest'
import { parseMonth } from '../src/parse/month'
import JAN from './fixtures/JAN.json'
import AUG from './fixtures/AUG.json'
import JUN_25 from './fixtures/JUN_25.json'

it('2019v1 has no bank/upcoming blocks and no issues about them', () => {
  const m = parseMonth('JAN', JAN as any)
  expect(m.banks).toEqual([]); expect(m.upcoming).toEqual([])
})
it('banks until Total label; rows below Total captured', () => {
  const m = parseMonth('AUG', AUG as any)
  expect(m.banks.length).toBe(3)          // fixture I2:I4 accounts
  expect(m.bankTotal).toBe(1234.5)        // J at I='Total'
  expect(m.expectedActual).not.toBeNull()
})
it('upcoming located by Total label at varying row', () => {
  expect(parseMonth('AUG', AUG as any).upcoming.length).toBe(3)
  expect(parseMonth('JUN_25', JUN_25 as any).upcoming.length).toBeGreaterThan(0)
})
it('missing Total marker → issue', () => {
  const broken = JSON.parse(JSON.stringify(AUG)) as any
  broken.values[4][8] = 'Totall' // corrupt the marker
  expect(parseMonth('AUG', broken).issues.some(i => i.kind === 'marker-not-found')).toBe(true)
})
```

- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implement** — banks: scan col I rows 2..60 for `Total` (case-insensitive, trimmed); rows above → `BankAccount[]`; row itself → `bankTotal`; next two labeled rows → `expectedActual`, `balanceAfterFuture` (match by label prefix, not fixed offset). Upcoming: scan col M rows 2..100 for `Total`; rows above with name → `UpcomingItem`. Marker missing where era expects block → issue `marker-not-found`, empty arrays. Era gates: `2019v1` no blocks; `2019v2` banks from JUN, upcoming from JUL (fixture AUG has both).
- [ ] **Step 4: PASS.**
- [ ] **Step 5: Commit** — `feat(FP): bank-balance and upcoming block parsing`

---

### Task 8: Sheets API client + GIS auth

**Files:**
- Create: `src/config.ts`, `src/api/gis.ts`, `src/api/sheets.ts`, `tests/sheets.test.ts`

**Interfaces:**
- Produces:
```ts
// config.ts
export const CONFIG = { sheetId: '<FILLED BY USER>', clientId: '<FILLED BY USER>',
  deadTabs: ['BAPTISM', 'OTTO', 'INDIA SEP 19', 'ETC-OLD', 'ETC'] }
// gis.ts
export function initAuth(onToken: (t: string) => void): void  // loads GIS script, silent-first requestAccessToken
export function signIn(): void                                 // interactive prompt
// sheets.ts
export class SheetsClient {
  constructor(getToken: () => string | null, fetchFn?: typeof fetch)
  listMonthTabs(): Promise<string[]>                 // spreadsheets.get fields=sheets.properties.title → isMonthTab filter, minus deadTabs
  fetchMonthGrids(tab: string): Promise<MonthGrids>  // batchGet UNFORMATTED_VALUE 'tab'!A1:P100 + batchGet FORMULA 'tab'!B3:B4,'tab'!G4,'tab'!G6
}
export class AuthExpiredError extends Error {}       // thrown on 401 — caller re-auths
```

- [ ] **Step 1: Failing tests** (mock fetch; GIS module excluded from unit tests — browser-only)

```ts
import { it, expect, vi } from 'vitest'
import { SheetsClient, AuthExpiredError } from '../src/api/sheets'

const ok = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))

it('quotes tab names and requests UNFORMATTED_VALUE', async () => {
  const f = vi.fn().mockImplementation((u: any) => ok({ valueRanges: [{ values: [[1]] }, { values: [] }] }))
  const c = new SheetsClient(() => 'tok', f as any)
  await c.fetchMonthGrids('JAN_22')
  const url = String(f.mock.calls[0][0])
  expect(url).toContain('valueRenderOption=UNFORMATTED_VALUE')
  expect(url).toContain(encodeURIComponent("'JAN_22'!A1:P100"))
})
it('401 → AuthExpiredError', async () => {
  const f = vi.fn().mockResolvedValue(new Response('', { status: 401 }))
  const c = new SheetsClient(() => 'tok', f as any)
  await expect(c.listMonthTabs()).rejects.toBeInstanceOf(AuthExpiredError)
})
it('listMonthTabs filters non-month and dead tabs', async () => {
  const f = vi.fn().mockImplementation(() => ok({ sheets: [{ properties: { title: 'JAN_22' } }, { properties: { title: 'SACHIN' } }, { properties: { title: 'ETC' } }] }))
  const c = new SheetsClient(() => 'tok', f as any)
  expect(await c.listMonthTabs()).toEqual(['JAN_22'])
})
```

- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implement** — `sheets.ts` per interface: base `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.sheetId}`; `fetchMonthGrids` = two batchGet calls (values render UNFORMATTED_VALUE + dateTimeRenderOption SERIAL_NUMBER; formulas render FORMULA), map formula valueRanges back to keys `B3,B4,G4,G6`; missing tab in sheet → throw `TabNotFoundError` (export it). `gis.ts`: inject `https://accounts.google.com/gsi/client` script once; `initTokenClient` with scope `spreadsheets.readonly`; `requestAccessToken({prompt:''})` on init, `signIn()` uses `{prompt:'consent'}` fallback; store expiry (now + expires_in) and proactively null token 1 min early.
- [ ] **Step 4: PASS.**
- [ ] **Step 5: Commit** — `feat(FP): sheets api client and gis token auth`

---

### Task 9: IndexedDB cache + orchestrator

**Files:**
- Create: `src/cache/db.ts`, `src/data/orchestrator.ts`, `tests/orchestrator.test.ts`

**Interfaces:**
- Produces:
```ts
// cache/db.ts  (raw indexedDB, no lib; store 'grids': key tab → {fetchedAt: number, grids: MonthGrids})
export function getCached(tab: string): Promise<{ fetchedAt: number; grids: MonthGrids } | null>
export function putCached(tab: string, grids: MonthGrids, fetchedAt?: number): Promise<void> // fetchedAt param for tests; defaults to Date.now()
// data/orchestrator.ts
export interface LoadResult { months: MonthData[]; issues: ParserIssue[] }
export const LIVE_TTL_MS = 10 * 60 * 1000
export async function loadMonths(client: SheetsClient, now: Date): Promise<LoadResult>
// rule: tab === currentTabName(now) → live (refetch if age > LIVE_TTL_MS); else immutable (cache hit = never refetch)
// missing current-month tab (TabNotFoundError) → skip + issue kind 'missing-current-month'
```

- [ ] **Step 1: Failing tests** (fake-indexeddb in `tests/setup.ts`: `import 'fake-indexeddb/auto'`; add `test.setupFiles` in vite config)

```ts
import { it, expect, vi } from 'vitest'
import { loadMonths, LIVE_TTL_MS } from '../src/data/orchestrator'
import { putCached } from '../src/cache/db'
import JAN_22 from './fixtures/JAN_22.json'

const NOW = new Date(2022, 1, 15) // FEB_22 is current
function fakeClient(tabs: string[]) {
  return { listMonthTabs: async () => tabs, fetchMonthGrids: vi.fn(async () => JAN_22) } as any
}
it('historical tab served from cache without refetch', async () => {
  await putCached('JAN_22', JAN_22 as any)
  const c = fakeClient(['JAN_22'])
  await loadMonths(c, NOW)
  expect(c.fetchMonthGrids).not.toHaveBeenCalled()
})
it('uncached tab fetched then cached', async () => {
  const c = fakeClient(['MAR_21'])
  await loadMonths(c, NOW)
  expect(c.fetchMonthGrids).toHaveBeenCalledWith('MAR_21')
  const c2 = fakeClient(['MAR_21'])
  await loadMonths(c2, NOW)
  expect(c2.fetchMonthGrids).not.toHaveBeenCalled()
})
it('current month refetched when stale', async () => {
  await putCached('FEB_22', JAN_22 as any, NOW.getTime() - LIVE_TTL_MS - 1)
  const c = fakeClient(['FEB_22'])
  await loadMonths(c, NOW)
  expect(c.fetchMonthGrids).toHaveBeenCalledWith('FEB_22')
})
it('current month served from cache when fresh', async () => {
  await putCached('FEB_22', JAN_22 as any, NOW.getTime() - 1000)
  const c = fakeClient(['FEB_22'])
  await loadMonths(c, NOW)
  expect(c.fetchMonthGrids).not.toHaveBeenCalled()
})
it('parse errors collected, not thrown', async () => {
  const bad = { values: [], formulas: {} }
  const c = { listMonthTabs: async () => ['APR_20'], fetchMonthGrids: async () => bad } as any
  const r = await loadMonths(c, NOW)
  expect(r.months.length).toBe(1) // empty-but-present MonthData
})
```

- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implement** — `db.ts`: open `finance-planner` v1, objectStore `grids`; promisify requests. `orchestrator.ts`: list tabs → for each: cached & (immutable || fresh) ? use : fetch+put; parse all with `parseMonth`; aggregate issues. Fetch sequentially with `Promise.allSettled` over chunks of 5 (batchGet quota kindness); failed tab → issue kind `fetch-failed`, continue.
- [ ] **Step 4: PASS.**
- [ ] **Step 5: Commit** — `feat(FP): indexeddb cache and month load orchestrator`

---

### Task 10: Minimal UI — SignIn, Overview, Parser Health

**Files:**
- Modify: `src/ui/App.tsx`, `src/main.tsx`
- Create: `src/ui/SignIn.tsx`, `src/ui/Overview.tsx`, `src/ui/ParserHealth.tsx`, `src/ui/app.css`

**Interfaces:**
- Consumes: `initAuth/signIn`, `SheetsClient`, `loadMonths`, `MonthData`.
- Produces: working app. No new libs. State via `useState`/`useEffect` only (no store lib — YAGNI).

- [ ] **Step 1: Implement App shell** — states: `unauthenticated | loading | ready | error`. On token → `loadMonths` → render tabs `Overview | Parser Health` (plain buttons). `AuthExpiredError` during load → back to SignIn with "session expired" note. Offline/fetch-fail with cached months present → banner `showing cached data`.

```tsx
// Overview.tsx (core render, style via app.css)
export function Overview({ months, now }: { months: MonthData[]; now: Date }) {
  const cur = months.find(m => m.tab === currentTabName(now)) ?? months.at(-1)
  if (!cur) return <p>No data.</p>
  const income = cur.income.reduce((s, t) => s + (t.amountEUR ?? 0), 0)
  const expense = cur.expenses.reduce((s, t) => s + (t.amountEUR ?? 0), 0)
  return (
    <section>
      <h2>{cur.tab}{cur.tab !== currentTabName(now) && ' (latest — current month tab missing)'}</h2>
      <div className="cards">
        <Card label="Income" v={income} /> <Card label="Expense" v={expense} />
        <Card label="Balance" v={income - expense + (cur.carryover ?? 0)} />
        <Card label="Bank total" v={cur.bankTotal} />
      </div>
      <h3>Upcoming to pay</h3>
      <ul>{cur.upcoming.filter(u => (u.toPay ?? 0) > 0).map(u => <li key={u.name}>{u.name}: {u.toPay} €</li>)}</ul>
    </section>
  )
}
```

`ParserHealth.tsx`: table of all `issues` (sheet, cell, kind, detail), count badge in tab button. Empty state: "All cells parsed cleanly."
`app.css`: mobile-first, `prefers-color-scheme` dark/light variables, simple card grid.

- [ ] **Step 2: Verify** — `npm run typecheck && npm test && npm run build` green. `npm run dev` renders SignIn (auth flow itself needs real client ID — Task 11).
- [ ] **Step 3: Commit** — `feat(FP): minimal ui with overview and parser health`

---

### Task 11: GCP setup + first deploy (user-in-the-loop)

**Files:**
- Modify: `src/config.ts` (real IDs), `README.md`

**Interfaces:**
- Consumes: everything. Produces: live site.

- [ ] **Step 1: Write README** — GCP walkthrough for the user: create project → enable Sheets API → OAuth consent screen (Testing mode, add own Gmail as test user) → create OAuth **Web application** client ID with authorized JS origins `https://<user>.github.io` AND `http://localhost:5173` → paste client ID + spreadsheet ID into `src/config.ts`. Note: repo must be public + Pages source "GitHub Actions" in repo settings.
- [ ] **Step 2: User performs GCP steps in browser** (guide live; do not proceed until IDs exist).
- [ ] **Step 3: Fill `config.ts`, verify locally** — `npm run dev`, sign in, real sheet loads, Overview shows current month, Parser Health lists real-world quirks (expected — record them for Plan 2 tuning).
- [ ] **Step 4: Commit + push** (with user approval) — `feat(FP): wire real oauth client and spreadsheet id`; verify Actions run deploys Pages; sign in on the live URL.

---

## Self-review notes

- Spec coverage (Plan 1 scope): month parsing all eras ✔ (T4–T7), auth ✔ (T8), cache immutable/live ✔ (T9), Parser Health first-class ✔ (T10), offline banner ✔ (T10), missing current-month fallback ✔ (T9/T10), CI+Pages ✔ (T1, T11). Deferred to Plan 2: special sheets, budget vs actual, trends, investments, Sachin, trips, logs, goals/recurring, carryover-drift display, charts lib decision.
- Type consistency: `MonthGrids` defined T5, consumed T8/T9; `AuthExpiredError` T8 → T10; `currentTabName` T2 → T9/T10.
- Carryover-chain drift computation deliberately deferred — needs full month set + UI home (Plan 2 Trends).
