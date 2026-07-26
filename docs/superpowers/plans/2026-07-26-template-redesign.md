# Template Redesign + Theme Switching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the shell and Overview/Budget/Trends screens to match `docs/finance-planner.html`'s visual language, reskin the other six screens, and add a Light/Dark/System theme toggle.

**Architecture:** Token swap in `app.css` (all tokens under `:root[data-theme='dark'|'light']`), a small `theme.ts` + ThemeContext owning mode/resolution, new pure libs (`kpis.ts`, `incomeGroups.ts`, `upcomingProviders.ts`) feeding rebuilt screens, shared primitives (`KpiCard`, `BarMeter`, DataGrid CSS) in `shared.tsx`/`app.css`. Spec: `docs/superpowers/specs/2026-07-26-template-redesign-design.md`.

**Tech Stack:** React 19 + Vite + TS, recharts 2, vitest (node env — **no component tests; test pure libs only**), `@fontsource/ibm-plex-mono` (new dev-time dep, bundled).

## Global Constraints

- **NEVER commit without the user's explicit approval** (repo rule). Each task's commit step means: run the git commands ONLY after the user has approved; otherwise report the proposed message and stop.
- Commit format: `<type>(FP): <subject>`.
- No real financial data in repo; test fixtures synthetic.
- **Carryover is not income**: KPI Income = `overviewFigures().incomeOwn`; carryover only in notes/separate rows.
- Parsers/libs under `src/parse` untouched. Existing tests must stay green after every task: `npm test`.
- Verification per task: `npm run typecheck && npm test`. Screens additionally: `npm run dev` visual check both themes.
- Existing CSS variable NAMES stay (1685-line app.css depends on them); values change. New tokens additive.
- All amount cells use the existing `Money` component (`src/ui/shared.tsx:33`) or `.num` class; never hand-format euros.
- Working tree already has unrelated WIP (creditCardBills, normalize, Overview): don't revert; `git add` only files each task touches.

---

### Task 1: Theme mode module (`theme.ts`)

**Files:**
- Create: `src/lib/theme.ts`
- Test: `tests/theme.test.ts`

**Interfaces:**
- Consumes: nothing (pattern-copies the `_setStorage` seam from `src/state/appState.ts:61-69`).
- Produces:
  - `type ThemeMode = 'light' | 'dark' | 'system'`
  - `type ResolvedScheme = 'light' | 'dark'`
  - `loadThemeMode(): ThemeMode` (default `'system'`, garbage in storage → `'system'`)
  - `saveThemeMode(mode: ThemeMode): void`
  - `resolveScheme(mode: ThemeMode, systemDark: boolean): ResolvedScheme`
  - `applyScheme(scheme: ResolvedScheme): void` (sets `document.documentElement.dataset.theme`; no-ops when `document` undefined)
  - `_setThemeStorage(s: Pick<Storage,'getItem'|'setItem'> | undefined): void` (test seam)

- [ ] **Step 1: Write the failing test**

```ts
// tests/theme.test.ts
import { beforeEach, describe, expect, it } from 'vitest'
import { loadThemeMode, saveThemeMode, resolveScheme, _setThemeStorage } from '../src/lib/theme'

function memStorage() {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
}

describe('theme mode persistence', () => {
  beforeEach(() => _setThemeStorage(memStorage()))

  it('defaults to system when nothing stored', () => {
    expect(loadThemeMode()).toBe('system')
  })

  it('round-trips an explicit mode', () => {
    saveThemeMode('dark')
    expect(loadThemeMode()).toBe('dark')
    saveThemeMode('light')
    expect(loadThemeMode()).toBe('light')
  })

  it('treats garbage in storage as system', () => {
    const s = memStorage()
    s.setItem('fp.theme', 'neon')
    _setThemeStorage(s)
    expect(loadThemeMode()).toBe('system')
  })

  it('survives missing storage (node env)', () => {
    _setThemeStorage(undefined)
    expect(loadThemeMode()).toBe('system')
    expect(() => saveThemeMode('dark')).not.toThrow()
  })
})

describe('resolveScheme', () => {
  it('explicit modes ignore the system flag', () => {
    expect(resolveScheme('dark', false)).toBe('dark')
    expect(resolveScheme('light', true)).toBe('light')
  })
  it('system follows the flag', () => {
    expect(resolveScheme('system', true)).toBe('dark')
    expect(resolveScheme('system', false)).toBe('light')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/theme.test.ts`
Expected: FAIL — cannot resolve `../src/lib/theme`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/theme.ts
// Theme mode (user choice) vs resolved scheme (what's on screen): 'system'
// resolves via matchMedia at the call site so this module stays pure enough
// for node-env tests. Storage seam mirrors src/state/appState.ts.
export type ThemeMode = 'light' | 'dark' | 'system'
export type ResolvedScheme = 'light' | 'dark'

const KEY = 'fp.theme'
const MODES: readonly ThemeMode[] = ['light', 'dark', 'system']

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>
let storage: StorageLike | undefined = typeof localStorage !== 'undefined' ? localStorage : undefined

export function _setThemeStorage(s: StorageLike | undefined): void {
  storage = s
}

export function loadThemeMode(): ThemeMode {
  const raw = storage?.getItem(KEY)
  return (MODES as readonly string[]).includes(raw ?? '') ? (raw as ThemeMode) : 'system'
}

export function saveThemeMode(mode: ThemeMode): void {
  storage?.setItem(KEY, mode)
}

export function resolveScheme(mode: ThemeMode, systemDark: boolean): ResolvedScheme {
  if (mode === 'system') return systemDark ? 'dark' : 'light'
  return mode
}

export function applyScheme(scheme: ResolvedScheme): void {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = scheme
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run tests/theme.test.ts` → PASS. Then `npm run typecheck && npm test` → all green.

- [ ] **Step 5: Commit (after user approval — see Global Constraints)**

```bash
git add src/lib/theme.ts tests/theme.test.ts
git commit -m "feat(FP): theme mode module with persistence"
```

---

### Task 2: Design tokens, fonts, pre-paint stamp

**Files:**
- Modify: `package.json` (add `@fontsource/ibm-plex-mono`)
- Modify: `src/main.tsx` (font imports)
- Modify: `index.html` (pre-paint theme stamp)
- Modify: `src/ui/app.css` (token blocks only, lines ~12-110: replace `:root` + `@media (prefers-color-scheme: dark)` with `data-theme` blocks)

**Interfaces:**
- Consumes: `localStorage['fp.theme']` written by Task 1's module (stamp script reads the same key).
- Produces: CSS custom properties every later task uses: existing names (`--surface`, `--surface-2`, `--accent`, `--accent-ink`, `--accent-wash`, plus whatever else the current `:root` block defines — keep ALL existing names) remapped to template values, and new tokens `--bg`, `--surface-3`, `--border`, `--border-row`, `--text`, `--text-2`, `--muted`, `--faint`, `--green`, `--green-deep`, `--red`, `--brick`, `--blue`, `--amber`, `--track`, `--mono`.

- [ ] **Step 1: Install font**

Run: `npm install @fontsource/ibm-plex-mono`
Then add to `src/main.tsx` above the App import:

```ts
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import '@fontsource/ibm-plex-mono/600.css'
```

- [ ] **Step 2: Pre-paint stamp in `index.html`**

Insert as first child of `<head>` (before the icon link):

```html
<script>
  (function () {
    var m = null;
    try { m = localStorage.getItem('fp.theme'); } catch (e) { /* private mode */ }
    var dark = m === 'dark' || (m !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  })();
</script>
```

- [ ] **Step 3: Rewrite token blocks in `app.css`**

Read the current `:root { ... }` block (starts line 12) and the `@media (prefers-color-scheme: dark)` block (starts line 70). Produce:

1. `:root, :root[data-theme='dark'] { ... }` — every existing variable name kept, values switched to the template dark palette; new tokens appended.
2. `:root[data-theme='light'] { ... }` — same names, light values.
3. Delete the `@media (prefers-color-scheme: dark)` wrapper entirely (JS owns resolution now). If other `prefers-color-scheme` queries exist elsewhere in the file (`grep -n "prefers-color-scheme" src/ui/app.css`), convert each to `:root[data-theme='dark'] ...` scoping.

Core values (template-exact dark / derived light):

```css
:root, :root[data-theme='dark'] {
  --bg: #0a0b0d;
  --surface: #101115;
  --surface-2: #0c0d10;
  --surface-3: #0d0e12;
  --border: #1e2026;
  --border-row: #16181d;
  --text: #e8e8ea;
  --text-2: #a9abb4;
  --muted: #8b8d96;
  --faint: #65676e;
  --green: #5ec98a;
  --green-deep: #4f9d76;
  --red: #d8705e;
  --brick: #a8604f;
  --blue: #7fb7ff;
  --amber: #c9a45e;
  --track: #1a1d23;
  --accent: #7fb7ff;
  --accent-ink: #0a0b0d;
  --accent-wash: rgba(127, 183, 255, 0.14);
  --mono: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
}

:root[data-theme='light'] {
  --bg: #f6f6f4;
  --surface: #ffffff;
  --surface-2: #f2f2ef;
  --surface-3: #efefec;
  --border: #e4e4e0;
  --border-row: #ececea;
  --text: #1d1e22;
  --text-2: #45464c;
  --muted: #6b6d75;
  --faint: #8e9098;
  --green: #2e7d54;
  --green-deep: #256744;
  --red: #b8503e;
  --brick: #a05240;
  --blue: #2a6fc0;
  --amber: #9a7728;
  --track: #e6e6e2;
  --accent: #2a6fc0;
  --accent-ink: #ffffff;
  --accent-wash: rgba(42, 111, 192, 0.12);
}
```

Every OTHER existing variable in the current `:root` (text colors, shadows, etc. — enumerate them when editing) must appear in both blocks mapped onto this palette (e.g. old `--ink`-style text vars → `--text` values). Body font-family stays the system stack; add utility:

```css
.num { font-family: var(--mono); font-variant-numeric: tabular-nums; letter-spacing: -0.02em; }
```

and set `body { background: var(--bg); color: var(--text); }`.

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm test && npm run build` → green (CSS-only change; tests unaffected).
Run: `npm run dev` — app renders in template-dark; flip `document.documentElement.dataset.theme='light'` in devtools console → light values apply everywhere, no unstyled patches.

- [ ] **Step 5: Commit (after user approval)**

```bash
git add package.json package-lock.json src/main.tsx index.html src/ui/app.css
git commit -m "feat(FP): template design tokens, IBM Plex Mono, pre-paint theme stamp"
```

---

### Task 3: ThemeContext, toggle control, chart palette rewire

**Files:**
- Create: `src/ui/theme/ThemeContext.tsx`
- Modify: `src/ui/charts/useColorScheme.ts` (context-backed)
- Modify: `src/ui/charts/palette.ts` (template chart colors)
- Modify: `src/main.tsx` (wrap `<App/>` in provider)

**Interfaces:**
- Consumes: Task 1's `loadThemeMode/saveThemeMode/resolveScheme/applyScheme`, `ThemeMode`, `ResolvedScheme`.
- Produces:
  - `ThemeProvider({ children })`
  - `useTheme(): { mode: ThemeMode; scheme: ResolvedScheme; setMode(m: ThemeMode): void }`
  - `ThemeToggle()` — 3-button segmented control (Light/Dark/System), rendered by Task 5's header.
  - `useColorScheme(): ColorScheme` keeps its existing signature (all chart wrappers keep working) but now returns the context scheme.

- [ ] **Step 1: Implement ThemeContext**

```tsx
// src/ui/theme/ThemeContext.tsx
// Owns theme mode + resolution. matchMedia listener active only in system
// mode. applyScheme stamps <html data-theme> so CSS tokens flip; charts read
// the same resolved scheme through useTheme()/useColorScheme().
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { applyScheme, loadThemeMode, resolveScheme, saveThemeMode } from '../../lib/theme'
import type { ResolvedScheme, ThemeMode } from '../../lib/theme'

interface ThemeCtx { mode: ThemeMode; scheme: ResolvedScheme; setMode: (m: ThemeMode) => void }

const Ctx = createContext<ThemeCtx | null>(null)

function systemDark(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : false
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(loadThemeMode)
  const [sysDark, setSysDark] = useState(systemDark)

  useEffect(() => {
    if (mode !== 'system' || typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e: MediaQueryListEvent) => setSysDark(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [mode])

  const scheme = resolveScheme(mode, sysDark)
  useEffect(() => applyScheme(scheme), [scheme])

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m)
    saveThemeMode(m)
    if (m === 'system') setSysDark(systemDark())
  }, [])

  const value = useMemo(() => ({ mode, scheme, setMode }), [mode, scheme, setMode])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useTheme(): ThemeCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useTheme outside ThemeProvider')
  return ctx
}

const LABELS: { mode: ThemeMode; label: string; title: string }[] = [
  { mode: 'light', label: '☀', title: 'Light' },
  { mode: 'dark', label: '☾', title: 'Dark' },
  { mode: 'system', label: '⌂', title: 'Follow system' },
]

export function ThemeToggle() {
  const { mode, setMode } = useTheme()
  return (
    <div className="theme-toggle" role="group" aria-label="Theme">
      {LABELS.map((o) => (
        <button
          key={o.mode}
          type="button"
          title={o.title}
          aria-pressed={mode === o.mode}
          className={mode === o.mode ? 'theme-toggle-btn active' : 'theme-toggle-btn'}
          onClick={() => setMode(o.mode)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Rewire `useColorScheme`**

Replace the body of `src/ui/charts/useColorScheme.ts`:

```ts
// Charts need concrete color values (SVG paint attrs), so they read the
// app's resolved theme — the ThemeContext, not the OS — as the single
// source of truth. Falls back to matchMedia when rendered outside the
// provider (tests, storybook-style harnesses).
import { useContext } from 'react'
import type { ColorScheme } from './palette'
import { SchemeFallbackContext } from './schemeContext'
```

Simplest concrete structure that avoids an import cycle (`ThemeContext` lives under `ui/theme/`, charts under `ui/charts/`): export the raw context from ThemeContext and consume it here:

```ts
import { useContext } from 'react'
import { ThemeSchemeContext } from '../theme/ThemeContext'
import type { ColorScheme } from './palette'

export function useColorScheme(): ColorScheme {
  const scheme = useContext(ThemeSchemeContext)
  return scheme ?? 'dark'
}
```

In `ThemeContext.tsx` add alongside the main context (and set it in the provider):

```tsx
export const ThemeSchemeContext = createContext<ResolvedScheme | null>(null)
// in ThemeProvider's return:
return (
  <Ctx.Provider value={value}>
    <ThemeSchemeContext.Provider value={scheme}>{children}</ThemeSchemeContext.Provider>
  </Ctx.Provider>
)
```

- [ ] **Step 3: Template chart palette**

In `src/ui/charts/palette.ts` replace the `LIGHT`/`DARK` constants (keep the `ChartPalette` shape and comments about fixed-order identity):

```ts
const DARK: ChartPalette = {
  categorical: ['#7fb7ff', '#a8604f', '#5ec98a', '#c9a45e', '#8f7fc4', '#5eb8c9', '#c95e93', '#9ab05e'],
  sequential: ['#16202e', '#1f3350', '#2a4a75', '#38639c', '#4a7ec2', '#639ae4', '#7fb7ff'],
  status: { good: '#5ec98a', warning: '#c9a45e', serious: '#d8705e', critical: '#e05252' },
  neutral: '#6c7180',
  surface: '#101115',
  gridline: '#1c1e24',
  axis: '#2a2d34',
  textPrimary: '#e8e8ea',
  textSecondary: '#a9abb4',
  textMuted: '#8b8d96',
  deltaGood: '#5ec98a',
  deltaBad: '#d8705e',
}

const LIGHT: ChartPalette = {
  categorical: ['#2a6fc0', '#a05240', '#2e7d54', '#9a7728', '#6a5aa8', '#2e7f93', '#a8446e', '#6d7f37'],
  sequential: ['#dbe8f8', '#b7d1f0', '#8fb5e5', '#6698d7', '#437cc4', '#2a6fc0', '#1d569c'],
  status: { good: '#2e7d54', warning: '#9a7728', serious: '#b8503e', critical: '#a52929' },
  neutral: '#8e9098',
  surface: '#ffffff',
  gridline: '#ececea',
  axis: '#d5d5d1',
  textPrimary: '#1d1e22',
  textSecondary: '#45464c',
  textMuted: '#6b6d75',
  deltaGood: '#2e7d54',
  deltaBad: '#b8503e',
}
```

- [ ] **Step 4: Wrap App + toggle CSS**

`src/main.tsx`:

```tsx
import { ThemeProvider } from './ui/theme/ThemeContext'
// ...
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
)
```

`app.css` append:

```css
.theme-toggle { display: flex; gap: 2px; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 3px; }
.theme-toggle-btn { border: 0; background: transparent; color: var(--muted); border-radius: 5px; padding: 4px 9px; cursor: pointer; font-size: 13px; line-height: 1; }
.theme-toggle-btn.active { background: var(--accent-wash); color: var(--text); }
```

- [ ] **Step 5: Verify**

Run: `npm run typecheck && npm test` → green.
Run: `npm run dev` — temporarily drop `<ThemeToggle/>` anywhere visible (or wait for Task 5); toggling flips tokens AND chart colors live; choice survives reload; System follows OS switch.

- [ ] **Step 6: Commit (after user approval)**

```bash
git add src/ui/theme/ThemeContext.tsx src/ui/charts/useColorScheme.ts src/ui/charts/palette.ts src/main.tsx src/ui/app.css
git commit -m "feat(FP): ThemeProvider, 3-way toggle, template chart palette"
```

---

### Task 4: KPI assembly lib (`kpis.ts`)

**Files:**
- Create: `src/lib/kpis.ts`
- Test: `tests/kpis.test.ts`

**Interfaces:**
- Consumes: `MonthData` (src/types.ts:30), `overviewFigures` (src/lib/overviewFigures.ts:50), `partitionUpcoming` (src/lib/foodHome.ts:25), `sortByPeriod`, `round2`, `sumAmounts` (src/lib/mathUtils.ts).
- Produces:

```ts
export type KpiId = 'income' | 'expenses' | 'saved' | 'cash' | 'savings' | 'upcoming' | 'networth'
export interface KpiCard {
  id: KpiId
  label: string
  value: number | null          // null → render '—'
  delta: number | null          // vs previous month, same metric; null when no prev
  goodUp: boolean               // is a positive delta good (colors delta text)
  series: number[]              // ≤12 trailing values ending at selected month
  note: string
}
export interface KpiOptions { target?: number | null; investedEUR?: number | null }
export function buildKpis(months: MonthData[], selectedTab: string, opts?: KpiOptions): KpiCard[]
```

Metric definitions (each month `m`):
- income = `overviewFigures(m).incomeOwn` (EXCLUDES carryover; note: `carryover €X excluded` when ≠ 0)
- expenses = `overviewFigures(m).expense`; note `across N line items`
- saved = `round2(incomeOwn - expense)`; goodUp; note `target met` / `€X below target` when `opts.target` set, else `income − expenses`
- cash = `m.bankTotal ?? round2(sum of m.banks)`; null when banks empty AND bankTotal null; note `across N accounts`
- savings = sum of `m.banks` whose name matches `/sav/i`; null when no such account; note = those account names joined
- upcoming = sum of `partitionUpcoming(m.upcoming).bills[].toPay ?? 0`; note `N bills` (goodUp=false)
- networth = `cash + savings + (opts.investedEUR ?? 0) − upcoming` with null-safe parts (null only when cash is null); note `incl. €X invested` when investedEUR provided, else `excl. investments`

Series: map metric over `sortByPeriod(months)` window of the 12 months ending at `selectedTab` (fewer when history short); `delta` = value − previous month's value when a previous month exists.

- [ ] **Step 1: Write the failing test** — synthetic `MonthData` builder (copy the minimal-object pattern from `tests/normalize.test.ts` fixtures; NO real data):

```ts
// tests/kpis.test.ts
import { describe, expect, it } from 'vitest'
import { buildKpis } from '../src/lib/kpis'
import type { MonthData, Tx } from '../src/types'

let row = 0
function tx(label: string, amountEUR: number | null, kind: 'income' | 'expense'): Tx {
  return { tab: 'T', row: ++row, label, normLabel: label.toLowerCase(), amountEUR, kind, planned: amountEUR === null, household: false }
}

function month(tab: string, year: number, mo: number, over: Partial<MonthData> = {}): MonthData {
  return {
    tab, period: { year, month: mo }, era: 'v2025',
    income: [tx('salary', 1000, 'income')], expenses: [tx('rent', 400, 'expense')],
    carryover: 50,
    summary: { totalIncome: null, totalExpense: null, balance: null, household: null },
    banks: [{ name: 'Main', amountEUR: 200 }, { name: 'Revolut Savings', amountEUR: 30 }],
    bankTotal: null, expectedActual: null, balanceAfterFuture: null,
    upcoming: [{ name: 'Card', total: 100, toPay: 80 }, { name: 'Food Home', total: 700, toPay: 120 }],
    issues: [], ...over,
  }
}

describe('buildKpis', () => {
  it('income excludes carryover', () => {
    const k = buildKpis([month('JUN_25', 2025, 6)], 'JUN_25')
    const income = k.find((c) => c.id === 'income')!
    expect(income.value).toBe(1000) // not 1050
    expect(income.note).toContain('carryover')
  })

  it('saved = own income minus expenses', () => {
    const k = buildKpis([month('JUN_25', 2025, 6)], 'JUN_25')
    expect(k.find((c) => c.id === 'saved')!.value).toBe(600)
  })

  it('upcoming sums bills only — food-home tracker excluded', () => {
    const k = buildKpis([month('JUN_25', 2025, 6)], 'JUN_25')
    expect(k.find((c) => c.id === 'upcoming')!.value).toBe(80)
  })

  it('savings pot picks /sav/i accounts; cash uses bank sum fallback', () => {
    const k = buildKpis([month('JUN_25', 2025, 6)], 'JUN_25')
    expect(k.find((c) => c.id === 'savings')!.value).toBe(30)
    expect(k.find((c) => c.id === 'cash')!.value).toBe(230)
  })

  it('delta + series across months, window ends at selected', () => {
    const m1 = month('MAY_25', 2025, 5, { expenses: [tx('rent', 300, 'expense')] })
    const m2 = month('JUN_25', 2025, 6)
    const k = buildKpis([m2, m1], 'JUN_25') // unsorted input on purpose
    const saved = k.find((c) => c.id === 'saved')!
    expect(saved.series).toEqual([700, 600])
    expect(saved.delta).toBe(-100)
  })

  it('missing data → null values, no throw', () => {
    const bare = month('JAN_22', 2022, 1, { banks: [], upcoming: [], bankTotal: null })
    const k = buildKpis([bare], 'JAN_22')
    expect(k.find((c) => c.id === 'cash')!.value).toBeNull()
    expect(k.find((c) => c.id === 'savings')!.value).toBeNull()
    expect(k.find((c) => c.id === 'networth')!.value).toBeNull()
  })

  it('networth includes invested when provided', () => {
    const k = buildKpis([month('JUN_25', 2025, 6)], 'JUN_25', { investedEUR: 1000 })
    // cash 230 + savings 30 + 1000 − upcoming 80
    expect(k.find((c) => c.id === 'networth')!.value).toBe(1180)
    expect(k.find((c) => c.id === 'networth')!.note).toContain('1,000')
  })
})
```

- [ ] **Step 2: Run to verify FAIL** — `npx vitest run tests/kpis.test.ts` → module not found.

- [ ] **Step 3: Implement `src/lib/kpis.ts`** per the metric definitions in the Interfaces block. Skeleton:

```ts
import type { MonthData } from '../types'
import { overviewFigures } from './overviewFigures'
import { partitionUpcoming } from './foodHome'
import { round2, sortByPeriod } from './mathUtils'

// ...KpiId/KpiCard/KpiOptions as in Interfaces block...

interface MetricParts { income: number; expenses: number; saved: number; cash: number | null; savings: number | null; upcoming: number; expenseCount: number; carryover: number; billCount: number; savingsNames: string[]; bankCount: number }

function metricsOf(m: MonthData): MetricParts {
  const f = overviewFigures(m)
  const { bills } = partitionUpcoming(m.upcoming)
  const upcoming = round2(bills.reduce((s, b) => s + (b.toPay ?? 0), 0))
  const savAccounts = m.banks.filter((b) => /sav/i.test(b.name))
  const savings = savAccounts.length ? round2(savAccounts.reduce((s, b) => s + b.amountEUR, 0)) : null
  const cash = m.bankTotal ?? (m.banks.length ? round2(m.banks.reduce((s, b) => s + b.amountEUR, 0)) : null)
  return {
    income: f.incomeOwn, expenses: f.expense, saved: round2(f.incomeOwn - f.expense),
    cash, savings, upcoming, expenseCount: m.expenses.length, carryover: f.carryover,
    billCount: bills.length, savingsNames: savAccounts.map((b) => b.name), bankCount: m.banks.length,
  }
}

export function buildKpis(months: MonthData[], selectedTab: string, opts: KpiOptions = {}): KpiCard[] {
  const sorted = sortByPeriod(months)
  const idx = sorted.findIndex((m) => m.tab === selectedTab)
  const end = idx >= 0 ? idx : sorted.length - 1
  const window = sorted.slice(Math.max(0, end - 11), end + 1)
  const parts = window.map(metricsOf)
  const cur = parts[parts.length - 1]
  const prev = parts.length > 1 ? parts[parts.length - 2] : null
  // build the 7 cards: value/delta/series per metric definition; networth =
  // cash+savings+invested−upcoming with null cash propagating null.
  // (full arithmetic per Interfaces block — no other business rules)
}
```

- [ ] **Step 4: Run tests** — `npx vitest run tests/kpis.test.ts` → PASS; `npm run typecheck && npm test` → green.

- [ ] **Step 5: Commit (after user approval)**

```bash
git add src/lib/kpis.ts tests/kpis.test.ts
git commit -m "feat(FP): KPI assembly lib (carryover-excluded income)"
```

---

### Task 5: Grouping libs — income sources & upcoming providers

**Files:**
- Create: `src/lib/incomeGroups.ts`, `src/lib/upcomingProviders.ts`
- Test: `tests/incomeGroups.test.ts`, `tests/upcomingProviders.test.ts`

**Interfaces:**
- Consumes: `Tx`, `UpcomingItem` (src/types.ts), `normLabel` (src/lib/normalize.ts:23), `partitionUpcoming` (foodHome.ts), `round2`.
- Produces:

```ts
// incomeGroups.ts
export interface IncomeGroup { name: string; total: number; items: { label: string; amountEUR: number | null; planned: boolean }[] }
export function groupIncome(income: Tx[]): IncomeGroup[]
// Group by normLabel regex, first match wins:
//   /salary|gehalt/ → 'Salary'; /kindergeld/ → 'Kindergeld';
//   /revolut/ → 'Revolut transfers'; /paypal/ → 'Paypal'; else 'Other'.
// Sorted by total desc; groups with zero items omitted.

// upcomingProviders.ts
export interface ProviderGroup { name: string; total: number; items: { label: string; toPay: number | null }[] }
export function groupUpcoming(bills: UpcomingItem[]): ProviderGroup[]
// Provider by normLabel(name) substring, first match wins:
//   'advanzia' → 'Advanzia' (normLabel already merges the 'advancia' typo);
//   'amex' → 'Amex'; 'sparkasse' → 'Sparkasse'; 'amazon' → 'Amazon';
//   'commerzbank' → 'Commerzbank'; else 'Other'.
// total = Σ toPay ?? 0; sorted total desc; caller passes partitionUpcoming().bills.
```

- [ ] **Step 1: Failing tests**

```ts
// tests/incomeGroups.test.ts
import { describe, expect, it } from 'vitest'
import { groupIncome } from '../src/lib/incomeGroups'
import type { Tx } from '../src/types'

function inc(label: string, amountEUR: number | null): Tx {
  return { tab: 'T', row: 1, label, normLabel: label.toLowerCase().trim(), amountEUR, kind: 'income', planned: false, household: false }
}

describe('groupIncome', () => {
  it('buckets by pattern and sorts by total desc', () => {
    const groups = groupIncome([
      inc('Salary', 3000), inc('Kindergeld', 250),
      inc('Revolut Add', 400), inc('Revolut Add', 100),
      inc('Paypal', 60), inc('Aman', 20),
    ])
    expect(groups.map((g) => g.name)).toEqual(['Salary', 'Revolut transfers', 'Kindergeld', 'Paypal', 'Other'])
    expect(groups[1].total).toBe(500)
    expect(groups[1].items).toHaveLength(2)
  })
  it('omits empty groups, handles null amounts', () => {
    const groups = groupIncome([inc('Salary', null)])
    expect(groups).toHaveLength(1)
    expect(groups[0].total).toBe(0)
  })
})
```

```ts
// tests/upcomingProviders.test.ts
import { describe, expect, it } from 'vitest'
import { groupUpcoming } from '../src/lib/upcomingProviders'

describe('groupUpcoming', () => {
  it('groups bills by provider substring with alias normalization', () => {
    const groups = groupUpcoming([
      { name: 'Advancia CC', total: 900, toPay: 900 },     // typo variant → Advanzia
      { name: 'Advanzia interest', total: 40, toPay: 40 },
      { name: 'Amex statement', total: 500, toPay: 500 },
      { name: 'Mystery bill', total: 10, toPay: 10 },
    ])
    expect(groups.map((g) => g.name)).toEqual(['Advanzia', 'Amex', 'Other'])
    expect(groups[0].total).toBe(940)
  })
  it('null toPay counts as 0 but the row stays listed', () => {
    const groups = groupUpcoming([{ name: 'Amex thing', total: 50, toPay: null }])
    expect(groups[0].total).toBe(0)
    expect(groups[0].items).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run to verify FAIL** — both suites: module not found.

- [ ] **Step 3: Implement both libs** exactly per the Interfaces block (each ~30 lines: match table as `[RegExp | string, string][]`, one pass accumulating into a `Map`, sort desc). `groupUpcoming` MUST call `normLabel(name)` before substring checks so `Advancia`→`advanzia` merges (that alias map lives in normalize.ts).

- [ ] **Step 4: Run tests** — suites PASS; `npm run typecheck && npm test` green.

- [ ] **Step 5: Commit (after user approval)**

```bash
git add src/lib/incomeGroups.ts src/lib/upcomingProviders.ts tests/incomeGroups.test.ts tests/upcomingProviders.test.ts
git commit -m "feat(FP): income-source and upcoming-provider grouping libs"
```

---

### Task 6: Shell — header, tab strip, month pills, KPI row

**Files:**
- Modify: `src/ui/Layout.tsx` (full rewrite of chrome; registry exports untouched)
- Modify: `src/ui/App.tsx` (selected-month state, pass-through)
- Modify: `src/ui/screens/registry.tsx` (add `selectedMonth` to `ScreenProps`)
- Create: `src/ui/KpiRow.tsx`
- Modify: `src/ui/shared.tsx` (add `KpiCardView`, `BarMeter`)
- Modify: `src/ui/app.css` (shell styles; delete `.sidebar`, `.bottomnav`, `.topbar` blocks)

**Interfaces:**
- Consumes: `buildKpis`/`KpiCard` (Task 4), `ThemeToggle` (Task 3), `overviewFigures`, `sortByPeriod`, `Sparkline` (src/ui/charts/Sparkline.tsx:14), `Money` (src/ui/shared.tsx:33), `pickDisplayedMonth` (src/lib/period.ts:28).
- Produces (used by Tasks 7-9):
  - `ScreenProps.selectedMonth: MonthData` (required — App always supplies; screens for which month is irrelevant ignore it)
  - `LayoutProps` gains `selectedMonth: MonthData`, `onSelectMonth(tab: string): void`, `months: MonthData[]`
  - `KpiRow({ months, selectedTab, opts }: { months: MonthData[]; selectedTab: string; opts?: KpiOptions })` — renders 7 `KpiCardView`s; Layout shows it only when `active ∈ {overview, budget, trends, networth}`
  - `shared.tsx`: `BarMeter({ pct: number, color?: string })` (track + fill, clamps 0-100), `KpiCardView({ card: KpiCard })`

Shell structure (template lines 160-199 as reference):

```tsx
<div className="shell2">
  <header className="fp-header">
    <div className="fp-header-left">
      <div className="kicker">Finance Planner</div>
      <div className="fp-header-title">
        <h1>{monthTitle}</h1>            {/* e.g. "Jul 2026" from selectedMonth.period */}
        <span className="headline num">{/* €X in · €Y out · +€Z saved, from overviewFigures(selectedMonth) incomeOwn/expense */}</span>
      </div>
    </div>
    <div className="fp-header-right">
      <nav className="tabstrip" aria-label="Primary">{/* 9 pills, Health badge */}</nav>
      <ThemeToggle />
    </div>
  </header>
  <div className="monthrow">
    <span className="kicker">Month</span>
    <button className="pill-nav" disabled={!canOlder} onClick={older}>‹</button>
    {windowMonths.map((m) => <button className={pill} onClick={() => onSelectMonth(m.tab)}>{label}</button>)}
    <button className="pill-nav" disabled={!canNewer} onClick={newer}>›</button>
  </div>
  {banner}{chip}
  {showKpis && <KpiRow ... />}
  <main className="screen"><Suspense ...><ActiveComponent {...screenProps} /></Suspense></main>
</div>
```

- [ ] **Step 1: registry + App state.** Add `selectedMonth: MonthData` to `ScreenProps` (registry.tsx:42). In App.tsx: `const [selectedTab, setSelectedTab] = useState<string | null>(null)`; effective month = `months.find((m) => m.tab === selectedTab) ?? pickDisplayedMonth(months, now)!`; pass `selectedMonth` into screenProps and `months/selectedMonth/onSelectMonth` into Layout. Month pill window state (`windowEnd` index, default last) lives in Layout.

- [ ] **Step 2: KpiRow + primitives.**

```tsx
// src/ui/KpiRow.tsx
import { buildKpis } from '../lib/kpis'
import type { KpiOptions } from '../lib/kpis'
import type { MonthData } from '../types'
import { KpiCardView } from './shared'

export function KpiRow({ months, selectedTab, opts }: { months: MonthData[]; selectedTab: string; opts?: KpiOptions }) {
  const cards = buildKpis(months, selectedTab, opts)
  return (
    <div className="kpi-grid">
      {cards.map((c) => <KpiCardView key={c.id} card={c} />)}
    </div>
  )
}
```

`KpiCardView` in shared.tsx: label (`.kicker`), value (`.num`, `—` for null, tone class from `goodUp`/sign), delta line (`.num`, signed, green/red/muted), `<Sparkline data={card.series} height={26} />`, note line. `BarMeter`:

```tsx
export function BarMeter({ pct, color }: { pct: number; color?: string }) {
  const w = Math.max(0, Math.min(100, pct))
  return (
    <div className="meter"><div className="meter-fill" style={{ width: `${w}%`, background: color ?? 'var(--accent)' }} /></div>
  )
}
```

- [ ] **Step 3: Layout rewrite** per the shell structure above. Tab pills from `SCREEN_ORDER`/`SCREEN_REGISTRY` (drop per-screen icons in the strip — text pills like the template; keep icons exported for future use or delete if unreferenced). Health badge count on its pill. `showKpis = ['overview','budget','trends','networth'].includes(active)`. Month pills: `sortByPeriod(months)` slice of 12 ending at `windowEnd`; `MMM'YY` mono labels; selected = accent-wash pill; ‹ › shift the window by 12, clamped.

- [ ] **Step 4: CSS.** Delete `.shell`, `.sidebar*`, `.bottomnav*`, `.topbar*` rules; add `.shell2` (flex column, `padding: 18px 22px 40px`, `gap: 14px`), `.fp-header` (flex, `border-bottom: 1px solid var(--border)`), `.kicker` (10.5px uppercase, `letter-spacing: .14em`, `color: var(--faint)`), `.tabstrip` (flex, `background: var(--surface)`, border, radius 8, padding 4; pills 7px 16px radius 6, active `background: var(--accent-wash); color: var(--text)`), `.monthrow` (flex wrap, mono 11.5px pills 5px 10px, bordered), `.kpi-grid` (`grid-template-columns: repeat(7, minmax(0,1fr))`; `@media (max-width: 1200px)` → 4; `@media (max-width: 700px)` → 2), `.kpi-card` (surface, border, radius 10, padding 13px 14px, flex column gap 9px), `.meter`/`.meter-fill` (height 6px, radius 3, `background: var(--track)` / fill). Mobile: `.tabstrip { overflow-x: auto; }`.

- [ ] **Step 5: Verify.** `npm run typecheck && npm test` green (registry prop addition is additive; screens ignore it until Tasks 7-9). `npm run dev`: tab strip navigates all 9 screens, month pills switch header headline + KPI values, KPI row hidden on Sachin/Trips/Logs/Goals/Health, both themes, narrow-viewport scroll works.

- [ ] **Step 6: Commit (after user approval)**

```bash
git add src/ui/Layout.tsx src/ui/App.tsx src/ui/screens/registry.tsx src/ui/KpiRow.tsx src/ui/shared.tsx src/ui/app.css
git commit -m "feat(FP): template shell — header, tab strip, global month pills, KPI row"
```

---

### Task 7: Overview rebuild

**Files:**
- Rewrite: `src/ui/Overview.tsx`
- Modify: `src/ui/app.css` (datagrid + overview grid styles)
- Modify: `src/ui/screens/registry.tsx` (overview lazy wrapper passes `selectedMonth`, `plan`)

**Interfaces:**
- Consumes: `selectedMonth` (Task 6), `groupIncome` (Task 5), `groupUpcoming` + `partitionUpcoming`, `categorize` (normalize.ts:139), `budgetActuals` (budgetActuals.ts:85) for per-category budget column (plan may be null → budget column shows `—`), `foodHomeRemainingFor` (foodHome.ts:44), `Money`, `BarMeter`, `getPalette`+`useColorScheme` for category dot colors (`categorical[i % 8]`, categories in total-desc order, stable within render).
- Produces: nothing consumed later — final screen.

Layout: `overview-grid` = `grid-template-columns: 1.35fr 1fr 1fr` (1-col under 1100px):
1. **Expenses by category** panel: rows = dot, category name, item count, share meter (share of month expense total), actual, budget (from `budgetActuals` rows when plan present, else `—`), variance (budget − actual, signed, green/red). Click toggles ONE expanded inset (`useState<string | null>`) listing that category's Tx sorted desc (planned/null-amount rows dimmed with `planned` styling + `—` amount).
2. **Income sources** panel: `groupIncome(selectedMonth.income)` rows with share meter vs income total, expandable items; below the groups one separated `carryover` row (`Carryover from last month` + amount, `.muted`, NOT in total). **Savings progress** panel: last 6 months from `sortByPeriod(months)` ending at selected — bar `|saved| / max(target ?? 0, 1200)` (green ≥ target, amber ≥ 0, red < 0; when target is null: green ≥ 0), signed amount, rate = saved/incomeOwn; footer `Saved in last 6 months` total. Target rule (locked): `plan.budgetTotals.surplus` when present and > 0, else null (bars then scale to max |saved| in the window, no target note). Same target feeds `KpiOptions.target` in Task 6's KpiRow call.
3. **Bank accounts** panel: `selectedMonth.banks` rows (name, amount), footer `Available + savings` = bankTotal ?? sum. **Upcoming to pay** panel: `partitionUpcoming(selectedMonth.upcoming)`; coverage = (cash + savings) − billsTotal; note copy exactly: `Covered by cash + savings with €X to spare.` / `Obligations exceed cash + savings by €X.` (red border tint `--brick` on the panel when negative); provider groups from `groupUpcoming(bills)` expandable (multi-open `Record<string, boolean>`); separate final row `Food budget remaining` from `foodHomeRemainingFor(selectedMonth)` when non-null (muted, excluded from total).

- [ ] **Step 1: CSS first** — add generic datagrid classes used by all three rebuilt screens:

```css
.panel2 { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
.panel2-head { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; border-bottom: 1px solid var(--border); font-size: 12.5px; font-weight: 600; }
.panel2-meta { font-family: var(--mono); font-size: 11px; color: var(--muted); font-weight: 400; }
.dg-cols { display: grid; align-items: center; padding: 7px 14px; font-size: 10.5px; letter-spacing: .1em; text-transform: uppercase; color: var(--faint); border-bottom: 1px solid var(--border-row); }
.dg-row { display: grid; align-items: center; padding: 9px 14px; border-bottom: 1px solid var(--border-row); }
.dg-row.clickable { cursor: pointer; }
.dg-row.clickable:hover { background: var(--surface-2); }
.dg-inset { background: var(--surface-2); border-bottom: 1px solid var(--border-row); padding: 6px 14px 10px 32px; }
.dg-foot { display: grid; padding: 10px 14px; background: var(--surface-3); }
.dot { width: 5px; height: 5px; border-radius: 1px; flex: none; }
.right { text-align: right; }
.overview-grid { display: grid; grid-template-columns: 1.35fr 1fr 1fr; gap: 14px; align-items: start; }
.col-stack { display: flex; flex-direction: column; gap: 14px; }
@media (max-width: 1100px) { .overview-grid { grid-template-columns: 1fr; } }
```

- [ ] **Step 2: Rewrite `Overview.tsx`** per the layout block. Component signature: `export function Overview({ months, selectedMonth, plan, appState }: { months: MonthData[]; selectedMonth: MonthData; plan?: MonthlyPlanData | null; appState?: AppState })`. Update the registry lazy wrapper accordingly (registry.tsx:150-153): pass `p.selectedMonth`, `p.plan`. Category rows: aggregate `selectedMonth.expenses` by `categorize(tx.normLabel, appState?.categoryOverrides)`; budget/variance columns only when `plan?.budget` provides that category (match on category string), else `—`.

- [ ] **Step 3: Verify.** `npm run typecheck && npm test` green. `npm run dev`: expand/collapse all three expandable panels; zero-amount items dimmed; coverage note flips copy and border with sign; both themes; 1-col at narrow width.

- [ ] **Step 4: Commit (after user approval)**

```bash
git add src/ui/Overview.tsx src/ui/screens/registry.tsx src/ui/app.css
git commit -m "feat(FP): overview rebuilt to template layout"
```

---

### Task 8: Budget rebuild

**Files:**
- Rewrite: `src/ui/screens/Budget.tsx`
- Modify: `src/ui/app.css` (only if a needed class is missing — reuse Task 7's datagrid set)

**Interfaces:**
- Consumes: `budgetActuals(month, budget, overrides, now, plannedSurplus)` (budgetActuals.ts:85 — existing call in current Budget.tsx shows the wiring; keep it), `categorySeries(months, overrides, topN)` (trends.ts:33) for the 6-mo avg column, `selectedMonth`, `Money`, `BarMeter`, datagrid CSS.
- Produces: final screen.

Layout: two columns `1.25fr 1fr` (1-col under 1100px):
1. **Budget vs actual — {month}** panel: header meta `€X under plan`/`€X over plan` (green/red) from `totals.surplus` sign inverted vs template (surplus = planned − actual: positive → under plan). Columns `Category | Used of budget | Actual | Budget | Left | 6-mo avg`; usage meter fill color: `--red` >100%, `--amber` >90%, else `--green`; `Left` signed/colored; 6-mo avg per category = mean of that category's last ≤6 `categorySeries` points EXCLUDING the selected month (recompute, never sheet AVG — golden rule). `unbudgeted` rows appended with `—` budget. Totals row = `.dg-foot`.
2. **All line items** panel: header = title + search `<input>` (`useState('')`, filter on `label` OR category containing query, case-insensitive) + count meta `n of m`; scrolling body (`max-height: 660px; overflow-y: auto`), rows label / category / amount desc-sorted, planned dimmed.

- [ ] **Step 1: Rewrite screen.** Keep existing props contract from registry (months, plan, state, now) + add `selectedMonth` in the registry wrapper (replaces its internal month picking — delete any local month-selector UI; global pills own it now).
- [ ] **Step 2: Verify.** `npm run typecheck && npm test`; dev check: search filters live, meters color-switch at 90/100%, totals row matches sheet-first semantics, both themes.
- [ ] **Step 3: Commit (after user approval)**

```bash
git add src/ui/screens/Budget.tsx src/ui/screens/registry.tsx src/ui/app.css
git commit -m "feat(FP): budget screen rebuilt to template layout"
```

---

### Task 9: Trends rebuild

**Files:**
- Rewrite: `src/ui/screens/Trends.tsx`
- Modify: `src/ui/screens/registry.tsx` (wrapper passes `selectedMonth` + `onSelectMonth` — add `onSelectMonth?: (tab: string) => void` to `ScreenProps`)
- Modify: `src/ui/App.tsx` (pass `onSelectMonth` into screenProps)

**Interfaces:**
- Consumes: `monthlyTotals` (trends.ts:25), `categorySeries` (trends.ts:33), `buildKpis` series (or recompute cash/debt via Task 4's exported helper — export `metricsOf` from kpis.ts as `monthMetrics(m: MonthData)` for reuse), recharts (`LineChart`, `Line`, `XAxis`, `YAxis`, `Tooltip`, `CartesianGrid`, `ResponsiveContainer`), `getPalette(useColorScheme())`, `Sparkline`, `Money`.
- Produces: final screen. **Requires kpis.ts change:** rename/export `metricsOf` → `export function monthMetrics(m: MonthData): MetricParts` (same body; `buildKpis` calls it) — do this here with a one-line test in `tests/kpis.test.ts` asserting `monthMetrics(month(...)).upcoming === 80`.

Layout, top to bottom:
1. **Net worth & cash — 12 months** panel: `LineChart` over the last-12 window ending at selected month; three `Line`s — net worth (`palette.categorical[0]`, width 2.2), cash (`deltaGood`, 1.6), card debt as negative burden (`categorical[1]`, 1.6) — values from `monthMetrics`: `nw = (cash ?? 0)+(savings ?? 0)−upcoming`, `cash`, `−upcoming`. Legend chips manual (template style). Recharts `Tooltip` with mono values; `onClick={(e) => e?.activeLabel && onSelectMonth(tabFor(e.activeLabel))}`.
2. **Month by month** panel: one row per window month — month (mono), income, expenses, saved (signed/colored), rate %, cash, upcoming (brick), net worth (blue), top category (largest categorize() bucket that month); selected row `background: var(--surface-2)`; `onClick` → `onSelectMonth(m.tab)`.
3. **Category trend — 12 months** panel: per category (total-desc, all with nonzero window total): dot, name, `Sparkline` of the category's window series, this-month value, 6-mo avg (excl. selected), vs-avg delta (red = above avg, green = below — expenses).

- [ ] **Step 1: Export `monthMetrics` from kpis.ts** + failing/passing mini-test.
- [ ] **Step 2: Rewrite Trends.tsx** per layout. Delete its local month state if any.
- [ ] **Step 3: Verify.** `npm run typecheck && npm test`; dev: chart tooltips, row click flips global month (header + KPI row update), both themes.
- [ ] **Step 4: Commit (after user approval)**

```bash
git add src/ui/screens/Trends.tsx src/ui/screens/registry.tsx src/ui/App.tsx src/lib/kpis.ts tests/kpis.test.ts
git commit -m "feat(FP): trends screen rebuilt — chart, month table, category sparklines"
```

---

### Task 10: Reskin remaining screens + dead CSS sweep

**Files:**
- Modify: `src/ui/screens/NetWorth.tsx`, `Sachin.tsx`, `Trips.tsx`, `Logs.tsx`, `Goals.tsx`, `src/ui/ParserHealth.tsx`, `src/ui/SignIn.tsx` — spot-fixes only
- Modify: `src/ui/shared.tsx` (`StatCard`/`Panel`/`Section` restyle to panel2/kicker/num classes)
- Modify: `src/ui/app.css` (retire now-unused legacy classes)

**Interfaces:** consumes tokens + classes from Tasks 2/6/7; no new exports.

- [ ] **Step 1:** Restyle `StatCard`, `Panel`, `Section`, `EmptyState` internals in shared.tsx to the new classes (`panel2`, `panel2-head`, `kicker`, `.num` on values). Structure of the six screens untouched — they inherit the look through these primitives + tokens.
- [ ] **Step 2:** Grep each of the six screens for hardcoded hex colors and inline font-families (`grep -n "#[0-9a-fA-F]\{3,6\}\|font-family" src/ui/screens/*.tsx src/ui/ParserHealth.tsx src/ui/SignIn.tsx`); replace with tokens/`.num`. Amount cells not already using `Money` get `.num`.
- [ ] **Step 3:** Dead CSS sweep: for each class removed in Task 6 (`.sidebar*`, `.bottomnav*`, `.topbar*`) and any legacy class no longer referenced (`grep -o 'className="[^"]*"' -r src/ui | ...` vs app.css selectors), delete the rule. Keep anything still referenced.
- [ ] **Step 4:** Verify: `npm run typecheck && npm test && npm run build`; dev walk through all 9 screens × both themes × mobile width.
- [ ] **Step 5: Commit (after user approval)**

```bash
git add src/ui
git commit -m "style(FP): reskin remaining screens to template language, drop dead CSS"
```

---

### Task 11: Final verification

**Files:** none (verification only; fixes land as their own follow-ups).

- [ ] **Step 1:** `npm run typecheck && npm test && npm run lint && npm run build` — all green.
- [ ] **Step 2:** `npm run dev` full pass: sign-in screen themed; all 9 tabs; month pill paging into old eras (2019 tabs — sparse banks/upcoming must render `—`, not crash); theme toggle × 3 modes; reload persistence; OS-scheme flip in System mode; mobile width (tab scroll, KPI 2-col, overview 1-col).
- [ ] **Step 3:** Confirm Parser Health shows no NEW issue kinds introduced by the redesign (UI-only change — issue list should match pre-redesign for the same data).
- [ ] **Step 4:** Report results to user; propose final commit if any stragglers, and offer `git push` (main, per repo rule) after approval.
