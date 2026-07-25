// App shell chrome: nav (desktop sidebar / mobile bottom nav) + Suspense
// boundary around the active screen. The registry itself — ScreenId,
// ScreenProps, icons, and the lazy component for each of the 9 slots —
// lives in ./screens/registry.tsx so Tasks 9-13 can land a real module by
// editing only that file. Re-exported here so existing imports (App.tsx)
// don't need to know the registry moved. App.tsx still owns the auth/load
// state machine; this file only owns "which of the 9 screens is active"
// and how it's framed.
import { Suspense } from 'react'
import type { ReactNode } from 'react'
import { SCREEN_ORDER, SCREEN_REGISTRY } from './screens/registry'
import type { ScreenId, ScreenProps } from './screens/registry'
import { LoadingState } from './shared'

export { SCREEN_ORDER, SCREEN_REGISTRY }
export type { ScreenId, ScreenProps }

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
          <h2 className="topbar-title">{SCREEN_REGISTRY[active].label}</h2>
          {chip && <div className="topbar-chip">{chip}</div>}
        </header>
        {banner}
        <main className="screen">
          <Suspense fallback={<LoadingState label="Loading module…" />}>
            <ActiveComponent {...screenProps} />
          </Suspense>
        </main>
      </div>

      <nav className="bottomnav" aria-label="Primary (bottom)">
        <NavButtons active={active} onNavigate={onNavigate} issueCount={issueCount} />
      </nav>
    </div>
  )
}
