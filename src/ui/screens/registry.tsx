// The 9-module screen registry: ScreenId, the shared ScreenProps shape,
// nav icons, and the lazy component for each slot. Tasks 9-13 built each
// real module by editing ONLY this file — swap one `placeholderComponent(...)`
// call for a real lazy import; Task 13 (Goals) was the last placeholder
// slot, so every module is now real. Layout.tsx just consumes SCREEN_ORDER /
// SCREEN_REGISTRY and never needs touching when a module lands.
import { lazy } from 'react'
import type { ComponentType, LazyExoticComponent, ReactNode, SVGProps } from 'react'
import type { DeutscheBankData } from '../../parse/deutscheBank'
import type { MonthlyPlanData } from '../../parse/monthlyPlan'
import type { MutualFundsData } from '../../parse/mutualFunds'
import type { BinanceData } from '../../parse/binance'
import type { AppState } from '../../state/appState'
import type { MonthData, ParserIssue, PersonLedger, Trip } from '../../types'

export type ScreenId = 'overview' | 'budget' | 'trends' | 'networth' | 'sachin' | 'trips' | 'logs' | 'goals' | 'health'

/** Superset of props every screen may need. Concrete screens (Overview,
 * ParserHealth) destructure what they use; placeholders ignore all but
 * `label`. Keeping one shape means the registry can stay
 * `Record<ScreenId, LazyExoticComponent<ComponentType<ScreenProps>>>`
 * regardless of which real component eventually backs a slot.
 *
 * `plan`, `mutualFunds`, `deutscheBank`, `binance`, `sachin`, and `trips` are
 * optional/nullable because Task 14 (App.tsx -> useAppData wiring, see
 * src/data/useAppData.ts) passes real parsed data for them but each is
 * genuinely `null` whenever its special tab failed to fetch or parse — a
 * missing special tab never blocks 'ready', it just means that screen's
 * prop is null (see App.tsx's top comment). Every consumer (e.g. Budget,
 * NetWorth, Sachin, Trips) must still treat them as possibly null/undefined
 * and fall back sensibly (EmptyState / DEFAULT_STATE) — optional here mainly
 * so callers other than the real App.tsx (tests, future embeds) aren't
 * forced to supply them. Logs has no dedicated prop — its four log kinds all
 * live on `plan.logs`, so it reads `plan` like Budget/NetWorth do.
 *
 * `appState`/`onStateChange` (Task 13, wired Task 14): App.tsx always passes
 * both today — `appState` from `useAppData`'s `loadState()`, and
 * `onStateChange` calling `saveState` + re-rendering with the new state. The
 * Goals screen mutates a local copy and calls `onStateChange` on every edit;
 * both stay optional on this type so non-App.tsx callers don't have to wire
 * persistence just to render a screen. */
export interface ScreenProps {
  months: MonthData[]
  issues: ParserIssue[]
  now: Date
  label: string
  plan?: MonthlyPlanData | null
  mutualFunds?: MutualFundsData | null
  deutscheBank?: DeutscheBankData | null
  binance?: BinanceData | null
  sachin?: { ledger: PersonLedger } | null
  trips?: Trip[] | null
  appState?: AppState
  onStateChange?: (next: AppState) => void
}

type Icon = (props: SVGProps<SVGSVGElement>) => ReactNode

function IconOverview(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" {...props}>
      <rect x="2.5" y="2.5" width="6.5" height="6.5" rx="1.4" />
      <rect x="11" y="2.5" width="6.5" height="6.5" rx="1.4" />
      <rect x="2.5" y="11" width="6.5" height="6.5" rx="1.4" />
      <rect x="11" y="11" width="6.5" height="6.5" rx="1.4" />
    </svg>
  )
}

function IconBudget(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M3 6.5c0-1.1.9-2 2-2h9a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M3 8h13.5" />
      <circle cx="14" cy="11.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

function IconTrends(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M2.5 15.5 7 9.8l3.2 2.7L17 4.5" />
      <path d="M12.5 4.5H17V9" />
    </svg>
  )
}

function IconNetworth(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M10 2.5 3 6l7 3.5L17 6z" />
      <path d="M3 10l7 3.5L17 10" />
      <path d="M3 13.8l7 3.5 7-3.5" />
    </svg>
  )
}

function IconSachin(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="10" cy="6.2" r="3" />
      <path d="M3.5 17c.9-3.4 3.6-5.3 6.5-5.3s5.6 1.9 6.5 5.3" />
    </svg>
  )
}

function IconTrips(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="10" cy="10" r="7.2" />
      <path d="M13.2 6.8 11 11l-4.2 2.2L9 9z" />
    </svg>
  )
}

function IconLogs(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 3.5h12v13H4z" />
      <path d="M7 7.5h6M7 10.5h6M7 13.5h3.5" />
    </svg>
  )
}

function IconGoals(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" {...props}>
      <circle cx="10" cy="10" r="7" />
      <circle cx="10" cy="10" r="3.7" />
      <circle cx="10" cy="10" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  )
}

function IconHealth(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M2.5 10.8h3l1.6-3.8 2.4 6.8 1.8-5 1.3 2h4.9" />
    </svg>
  )
}

interface ScreenEntry {
  label: string
  icon: Icon
  component: LazyExoticComponent<ComponentType<ScreenProps>>
}

const overviewComponent = lazy(async () => {
  const { Overview } = await import('../Overview')
  return { default: (p: ScreenProps) => <Overview months={p.months} now={p.now} appState={p.appState} /> }
})

const healthComponent = lazy(async () => {
  const { ParserHealth } = await import('../ParserHealth')
  return { default: (p: ScreenProps) => <ParserHealth issues={p.issues} /> }
})

const budgetComponent = lazy(async () => {
  const [{ Budget }, { DEFAULT_STATE }] = await Promise.all([import('./Budget'), import('../../state/appState')])
  return {
    default: (p: ScreenProps) => (
      <Budget months={p.months} plan={p.plan ?? null} state={p.appState ?? DEFAULT_STATE} now={p.now} />
    ),
  }
})

const trendsComponent = lazy(async () => {
  const [{ Trends }, { DEFAULT_STATE }] = await Promise.all([import('./Trends'), import('../../state/appState')])
  return {
    default: (p: ScreenProps) => <Trends months={p.months} state={p.appState ?? DEFAULT_STATE} now={p.now} />,
  }
})

const networthComponent = lazy(async () => {
  const [{ NetWorth }, { DEFAULT_STATE }] = await Promise.all([import('./NetWorth'), import('../../state/appState')])
  return {
    default: (p: ScreenProps) => (
      <NetWorth
        months={p.months}
        plan={p.plan ?? null}
        mutualFunds={p.mutualFunds ?? null}
        deutscheBank={p.deutscheBank ?? null}
        binance={p.binance ?? null}
        fxRate={(p.appState ?? DEFAULT_STATE).fxRate}
        now={p.now}
      />
    ),
  }
})

const sachinComponent = lazy(async () => {
  const { Sachin } = await import('./Sachin')
  return { default: (p: ScreenProps) => <Sachin sachin={p.sachin ?? null} issues={p.issues} /> }
})

const tripsComponent = lazy(async () => {
  const { Trips } = await import('./Trips')
  return { default: (p: ScreenProps) => <Trips trips={p.trips ?? null} /> }
})

const logsComponent = lazy(async () => {
  const { Logs } = await import('./Logs')
  return { default: (p: ScreenProps) => <Logs plan={p.plan ?? null} /> }
})

const goalsComponent = lazy(async () => {
  const [{ Goals }, { DEFAULT_STATE }] = await Promise.all([import('./Goals'), import('../../state/appState')])
  return {
    default: (p: ScreenProps) => (
      <Goals months={p.months} state={p.appState ?? DEFAULT_STATE} now={p.now} onStateChange={p.onStateChange} />
    ),
  }
})

export const SCREEN_ORDER: ScreenId[] = ['overview', 'budget', 'trends', 'networth', 'sachin', 'trips', 'logs', 'goals', 'health']

export const SCREEN_REGISTRY: Record<ScreenId, ScreenEntry> = {
  overview: { label: 'Overview', icon: IconOverview, component: overviewComponent },
  budget: { label: 'Budget', icon: IconBudget, component: budgetComponent },
  trends: { label: 'Trends', icon: IconTrends, component: trendsComponent },
  networth: { label: 'Net worth', icon: IconNetworth, component: networthComponent },
  sachin: { label: 'Sachin', icon: IconSachin, component: sachinComponent },
  trips: { label: 'Trips', icon: IconTrips, component: tripsComponent },
  logs: { label: 'Logs', icon: IconLogs, component: logsComponent },
  goals: { label: 'Goals', icon: IconGoals, component: goalsComponent },
  health: { label: 'Parser Health', icon: IconHealth, component: healthComponent },
}
