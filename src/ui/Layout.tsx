// App shell chrome: nav (desktop sidebar / mobile bottom nav) + the lazy
// screen registry. Task 9-13 modules slot in by swapping one registry
// entry's `component` — nothing else here changes. App.tsx still owns the
// auth/load state machine; this file only owns "which of the 9 screens is
// active" and how it's framed.
import { lazy, Suspense } from 'react'
import type { ComponentType, LazyExoticComponent, ReactNode, SVGProps } from 'react'
import type { MonthData, ParserIssue } from '../types'
import { LoadingState } from './shared'

export type ScreenId = 'overview' | 'budget' | 'trends' | 'networth' | 'sachin' | 'trips' | 'logs' | 'goals' | 'health'

/** Superset of props every screen may need. Concrete screens (Overview,
 * ParserHealth) destructure what they use; placeholders ignore all but
 * `label`. Keeping one shape means the registry can stay
 * `Record<ScreenId, LazyExoticComponent<ComponentType<ScreenProps>>>`
 * regardless of which real component eventually backs a slot. */
export interface ScreenProps {
  months: MonthData[]
  issues: ParserIssue[]
  now: Date
  label: string
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
  const { Overview } = await import('./Overview')
  return { default: (p: ScreenProps) => <Overview months={p.months} now={p.now} /> }
})

const healthComponent = lazy(async () => {
  const { ParserHealth } = await import('./ParserHealth')
  return { default: (p: ScreenProps) => <ParserHealth issues={p.issues} /> }
})

function placeholderComponent(label: string): LazyExoticComponent<ComponentType<ScreenProps>> {
  return lazy(async () => {
    const { default: Placeholder } = await import('./screens/Placeholder')
    return { default: () => <Placeholder label={label} /> }
  })
}

export const SCREEN_ORDER: ScreenId[] = ['overview', 'budget', 'trends', 'networth', 'sachin', 'trips', 'logs', 'goals', 'health']

export const SCREEN_REGISTRY: Record<ScreenId, ScreenEntry> = {
  overview: { label: 'Overview', icon: IconOverview, component: overviewComponent },
  budget: { label: 'Budget', icon: IconBudget, component: placeholderComponent('Budget') },
  trends: { label: 'Trends', icon: IconTrends, component: placeholderComponent('Trends') },
  networth: { label: 'Net worth', icon: IconNetworth, component: placeholderComponent('Net worth') },
  sachin: { label: 'Sachin', icon: IconSachin, component: placeholderComponent('Sachin') },
  trips: { label: 'Trips', icon: IconTrips, component: placeholderComponent('Trips') },
  logs: { label: 'Logs', icon: IconLogs, component: placeholderComponent('Logs') },
  goals: { label: 'Goals', icon: IconGoals, component: placeholderComponent('Goals') },
  health: { label: 'Parser Health', icon: IconHealth, component: healthComponent },
}

function NavButtons({
  active,
  onNavigate,
  issueCount,
}: {
  active: ScreenId
  onNavigate: (id: ScreenId) => void
  issueCount: number
}) {
  return (
    <>
      {SCREEN_ORDER.map((id) => {
        const entry = SCREEN_REGISTRY[id]
        const Icon = entry.icon
        const isActive = id === active
        return (
          <button
            key={id}
            type="button"
            className={isActive ? 'nav-item active' : 'nav-item'}
            onClick={() => onNavigate(id)}
            aria-current={isActive ? 'page' : undefined}
          >
            <span className="nav-item-icon">
              <Icon />
              {id === 'health' && issueCount > 0 && <span className="badge nav-item-badge">{issueCount}</span>}
            </span>
            <span className="nav-item-label">{entry.label}</span>
          </button>
        )
      })}
    </>
  )
}

export interface LayoutProps {
  active: ScreenId
  onNavigate: (id: ScreenId) => void
  issueCount: number
  banner?: ReactNode
  chip?: ReactNode
  screenProps: ScreenProps
}

export function Layout({ active, onNavigate, issueCount, banner, chip, screenProps }: LayoutProps) {
  const ActiveComponent = SCREEN_REGISTRY[active].component

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="brand-mark">FP</span>
          <span className="brand-name">Finance Planner</span>
        </div>
        <nav className="sidebar-nav" aria-label="Primary">
          <NavButtons active={active} onNavigate={onNavigate} issueCount={issueCount} />
        </nav>
        {chip && <div className="sidebar-chip">{chip}</div>}
      </aside>

      <div className="shell-main">
        <header className="topbar">
          <span className="topbar-title">{SCREEN_REGISTRY[active].label}</span>
          {chip && <div className="topbar-chip">{chip}</div>}
        </header>
        {banner}
        <main className="screen">
          <Suspense fallback={<LoadingState label="Loading module…" />}>
            <ActiveComponent {...screenProps} />
          </Suspense>
        </main>
      </div>

      <nav className="bottomnav" aria-label="Primary">
        <NavButtons active={active} onNavigate={onNavigate} issueCount={issueCount} />
      </nav>
    </div>
  )
}
