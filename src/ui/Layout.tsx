// App shell chrome (Task 6 template redesign): header (title + headline +
// tab strip + theme toggle), a global month-pill row, the cached-data
// banner/chip, the KPI row (Overview/Budget/Trends/NetWorth only), and the
// Suspense boundary around the active screen. The registry itself —
// ScreenId, ScreenProps, icons, and the lazy component for each of the 9
// slots — lives in ./screens/registry.tsx so a future module swap only
// touches that file. Re-exported here so existing imports (App.tsx) don't
// need to know the registry moved. App.tsx still owns the auth/load state
// machine and which month tab is selected; this file owns "which of the 9
// screens is active", the month-pill window (which 12-month slice is
// showing), and how all of it is framed.
import { Suspense, useState } from 'react'
import type { ReactNode } from 'react'
import { KpiRow } from './KpiRow'
import type { KpiOptions } from '../lib/kpis'
import { overviewFigures } from '../lib/overviewFigures'
import { sortByPeriod } from '../lib/mathUtils'
import type { MonthData } from '../types'
import { SCREEN_ORDER, SCREEN_REGISTRY } from './screens/registry'
import type { ScreenId, ScreenProps } from './screens/registry'
import { LoadingState, Money } from './shared'
import { ThemeToggle } from './theme/ThemeContext'

export { SCREEN_ORDER, SCREEN_REGISTRY }
export type { ScreenId, ScreenProps }

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const monthLabel = (m: MonthData) => `${MONTH_ABBR[m.period.month - 1]}'${String(m.period.year % 100).padStart(2, '0')}`

// Screens where "the currently selected month" drives a headline KPI
// strip. The other 5 (Sachin/Trips/Logs/Goals/Health) aren't month-scoped
// in the same way, so no KPI row.
const KPI_SCREENS = new Set<ScreenId>(['overview', 'budget', 'trends', 'networth'])

const WINDOW = 12

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

export interface LayoutProps {
  active: ScreenId
  onNavigate: (id: ScreenId) => void
  issueCount: number
  months: MonthData[]
  selectedMonth: MonthData
  onSelectMonth: (tab: string) => void
  banner?: ReactNode
  chip?: ReactNode
  screenProps: ScreenProps
  /** Target/investedEUR passed straight through to KpiRow's `opts` (App.tsx
   * computes both — see App.tsx's top comment). Optional so non-App.tsx
   * callers (tests) aren't forced to supply it; KpiRow itself already
   * defaults `opts` to `{}`. */
  kpiOpts?: KpiOptions
  /** Hard refresh (wipe cache + refetch everything — useAppData.refresh).
   * Optional: no handler, no button. */
  onRefresh?: () => void
}

export function Layout({
  active,
  onNavigate,
  issueCount,
  months,
  selectedMonth,
  onSelectMonth,
  banner,
  chip,
  screenProps,
  kpiOpts,
  onRefresh,
}: LayoutProps) {
  const ActiveComponent = SCREEN_REGISTRY[active].component
  const sorted = sortByPeriod(months)

  // Which 12-month slice of pills is showing — independent of which month
  // is actually selected (a user can page the window without changing the
  // selection, or select a pill then page away from it). Defaults to the
  // window ending at the latest month. The clamped value is the window's
  // START index (not its end) — clamping the end instead would let the
  // window shrink below 12 pills at the oldest page whenever the total
  // month count isn't an exact multiple of 12 (e.g. 25 months: an
  // end-clamped oldest page would show a single pill at index 0 instead of
  // the full 12-pill window `[0, 11]`).
  const maxStart = Math.max(0, sorted.length - WINDOW)
  const [windowStart, setWindowStart] = useState(() => maxStart)
  const safeStart = clamp(windowStart, 0, maxStart)
  const windowEnd = Math.min(sorted.length - 1, safeStart + WINDOW - 1)
  const windowMonths = sorted.slice(safeStart, windowEnd + 1)
  const canOlder = safeStart > 0
  const canNewer = windowEnd < sorted.length - 1

  const older = () => setWindowStart((s) => clamp(clamp(s, 0, maxStart) - WINDOW, 0, maxStart))
  const newer = () => setWindowStart((s) => clamp(clamp(s, 0, maxStart) + WINDOW, 0, maxStart))

  const figures = overviewFigures(selectedMonth)
  const saved = figures.incomeOwn - figures.expense
  const monthTitle = `${MONTH_ABBR[selectedMonth.period.month - 1]} ${selectedMonth.period.year}`

  return (
    <div className="shell2">
      <header className="fp-header">
        <div className="fp-header-left">
          <div className="kicker">Finance Planner</div>
          <div className="fp-header-title">
            <h1>{monthTitle}</h1>
            <span className="headline num">
              <Money amountEUR={figures.incomeOwn} tabular /> in · <Money amountEUR={figures.expense} tabular /> out ·{' '}
              {saved >= 0 && '+'}
              <Money amountEUR={saved} tabular /> saved
            </span>
          </div>
        </div>
        <div className="fp-header-right">
          <nav className="tabstrip" aria-label="Primary">
            {SCREEN_ORDER.map((id) => {
              const entry = SCREEN_REGISTRY[id]
              const isActive = id === active
              return (
                <button
                  key={id}
                  type="button"
                  className={isActive ? 'tabstrip-btn active' : 'tabstrip-btn'}
                  onClick={() => onNavigate(id)}
                  aria-current={isActive ? 'page' : undefined}
                >
                  {entry.label}
                  {id === 'health' && issueCount > 0 && <span className="tabstrip-badge">{issueCount}</span>}
                </button>
              )
            })}
          </nav>
          {onRefresh && (
            <button
              type="button"
              className="refresh-btn"
              onClick={onRefresh}
              title="Refresh — refetch all data from the sheet"
              aria-label="Refresh data"
            >
              ↻
            </button>
          )}
          <ThemeToggle />
        </div>
      </header>

      <div className="monthrow">
        <span className="kicker">Month</span>
        <button type="button" className="pill-nav" disabled={!canOlder} onClick={older} aria-label="Older months">
          ‹
        </button>
        {windowMonths.map((m) => {
          const isSelected = m.tab === selectedMonth.tab
          return (
            <button
              key={m.tab}
              type="button"
              className={isSelected ? 'month-pill active num' : 'month-pill num'}
              onClick={() => onSelectMonth(m.tab)}
              aria-current={isSelected ? 'true' : undefined}
            >
              {monthLabel(m)}
            </button>
          )
        })}
        <button type="button" className="pill-nav" disabled={!canNewer} onClick={newer} aria-label="Newer months">
          ›
        </button>
      </div>

      {banner}
      {chip}

      {KPI_SCREENS.has(active) && <KpiRow months={months} selectedTab={selectedMonth.tab} opts={kpiOpts} />}

      <main className="screen">
        <Suspense fallback={<LoadingState label="Loading module…" />}>
          <ActiveComponent {...screenProps} />
        </Suspense>
      </main>
    </div>
  )
}
