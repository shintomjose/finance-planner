// Shared, chrome-only building blocks used across screens: money
// formatting, stat tiles, section chrome, and empty/loading placeholders.
// StatCard still takes a pre-rendered `trend` node so screens that only
// need a plain stat tile never pull in recharts. KpiCardView (Task 6) is
// the one exception: it renders its own <Sparkline> directly, because by
// the time it exists KpiRow is already part of the eager Layout shell
// (rendered outside the lazy screen Suspense boundary on 4 of 9 screens),
// so recharts is in the main bundle regardless of which file does the
// importing — there's no lazy boundary left to protect here.
import type { ReactNode } from 'react'
import type { KpiCard } from '../lib/kpis'
import { Sparkline } from './charts/Sparkline'

const eurFmt = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
const inrFmt = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'INR' })

export interface MoneyProps {
  amountEUR?: number | null
  /** Native rupee figure — Sachin/Trips carry amounts that are ₹ in the
   * sheet itself (never a converted EUR value), so `mode: 'INR'` renders
   * THIS as the primary figure instead of running the usual EUR-primary
   * path. Ignored when `mode` is 'EUR' (the default). */
  amountINR?: number | null
  /** 'EUR' (default): `amountEUR` is primary, optionally with a secondary
   * ≈₹ figure via `fxRate`. 'INR': `amountINR` is primary, optionally with
   * a secondary ≈€ figure via `fxRate` (dividing rather than multiplying). */
  mode?: 'EUR' | 'INR'
  /** ₹ per €. When provided (and finite), renders a secondary converted
   * figure alongside the primary amount — e.g. for Sachin/Trips screens
   * that track rupee-denominated entries alongside their EUR equivalent. */
  fxRate?: number
  /** Opt into tabular-nums for columns that must align vertically (table
   * rows). Big standalone figures (stat-tile values) stay proportional. */
  tabular?: boolean
}

export function Money({ amountEUR, amountINR, mode = 'EUR', fxRate, tabular }: MoneyProps) {
  const cls = tabular ? 'money money-tabular' : 'money'

  if (mode === 'INR') {
    if (amountINR == null) return <span className="money money-dash">–</span>
    const eur = fxRate != null && Number.isFinite(fxRate) && fxRate !== 0 ? amountINR / fxRate : null
    return (
      <span className={cls}>
        {inrFmt.format(amountINR)}
        {eur != null && <span className="money-secondary">≈ {eurFmt.format(eur)}</span>}
      </span>
    )
  }

  if (amountEUR == null) return <span className="money money-dash">–</span>
  const inr = fxRate != null && Number.isFinite(fxRate) ? amountEUR * fxRate : null
  return (
    <span className={cls}>
      {eurFmt.format(amountEUR)}
      {inr != null && <span className="money-secondary">≈ {inrFmt.format(inr)}</span>}
    </span>
  )
}

export interface StatCardProps {
  label: string
  value: ReactNode
  sub?: ReactNode
  /** Visual emphasis only — not a reserved status token; use sparingly for
   * a delta that reads as clearly good/bad (e.g. balance sign). */
  tone?: 'neutral' | 'good' | 'bad'
  /** Pre-rendered trend node (e.g. `<Sparkline data={...} />`), supplied by
   * the caller so this module never has to import recharts. */
  trend?: ReactNode
}

export function StatCard({ label, value, sub, tone = 'neutral', trend }: StatCardProps) {
  return (
    <div className="stat-card" data-tone={tone}>
      <div className="stat-card-label">{label}</div>
      <div className="stat-card-value">{value}</div>
      {sub && <div className="stat-card-sub">{sub}</div>}
      {trend && <div className="stat-card-trend">{trend}</div>}
    </div>
  )
}

export interface SectionProps {
  title?: string
  actions?: ReactNode
  /** Extra class appended to the root 'section' element — lets a caller
   * (e.g. Overview's dashboard grid) tighten spacing for its own layout
   * without a new component. */
  className?: string
  children: ReactNode
}

export function Section({ title, actions, className, children }: SectionProps) {
  return (
    <section className={className ? `section ${className}` : 'section'}>
      {(title || actions) && (
        <div className="section-head">
          {title && <h3 className="section-title">{title}</h3>}
          {actions && <div className="section-actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

export interface PanelProps {
  title: string
  /** Extra class appended to the root 'panel' element for grid placement
   * (e.g. 'overview-panel-income'). */
  className?: string
  children: ReactNode
}

/** Dashboard-grid building block (Overview redesign): a bordered card with
 * a header that never scrolls and a body that scrolls internally
 * (`overflow-y: auto`) once its container gets a bounded height — see
 * `.panel` / `.panel-head` / `.panel-body` in app.css. Kept here (not
 * local to Overview.tsx) because the pattern is generically useful for any
 * screen that wants a fixed-height scrollable card. */
export function Panel({ title, className, children }: PanelProps) {
  return (
    <div className={className ? `panel ${className}` : 'panel'}>
      <div className="panel-head">
        <h3 className="panel-title">{title}</h3>
      </div>
      <div className="panel-body">{children}</div>
    </div>
  )
}

export interface EmptyStateProps {
  title?: string
  message: string
}

export function EmptyState({ title, message }: EmptyStateProps) {
  return (
    <div className="empty-state">
      {title && <div className="empty-state-title">{title}</div>}
      <p className="empty-state-message">{message}</p>
    </div>
  )
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="loading-state" role="status" aria-live="polite">
      <span className="loading-spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  )
}

/** Bare track + fill meter (e.g. a budget-pacing or goal-progress bar with
 * no reserved status color of its own). `pct` is clamped to [0, 100]. */
export function BarMeter({ pct, color }: { pct: number; color?: string }) {
  const w = Math.max(0, Math.min(100, pct))
  return (
    <div className="meter">
      <div className="meter-fill" style={{ width: `${w}%`, background: color ?? 'var(--accent)' }} />
    </div>
  )
}

/** One card in the global KPI row (KpiRow.tsx / Layout.tsx). `card.value`
 * and `card.delta` are already the metric's natural sign (e.g. a bill
 * increase is a positive `delta` even though `goodUp` is false for
 * Expenses) — tone compares the delta's sign against `goodUp` rather than
 * against zero on its own, so a bigger expense reads red and a bigger
 * income reads green. */
export function KpiCardView({ card }: { card: KpiCard }) {
  const { label, value, delta, goodUp, series, note } = card
  const deltaTone: 'good' | 'bad' | 'neutral' = delta == null || delta === 0 ? 'neutral' : (delta > 0) === goodUp ? 'good' : 'bad'
  const valueTone: 'bad' | 'neutral' = value != null && value < 0 ? 'bad' : 'neutral'

  return (
    <div className="kpi-card">
      <div className="kicker">{label}</div>
      <div className={`kpi-value num${valueTone === 'bad' ? ' tone-bad' : ''}`}>
        {value == null ? '—' : <Money amountEUR={value} tabular />}
      </div>
      <div className={`kpi-delta num tone-${deltaTone}`}>
        {delta == null ? (
          <span className="money-dash">—</span>
        ) : (
          <>
            {delta > 0 && '+'}
            <Money amountEUR={delta} tabular />
          </>
        )}
      </div>
      <Sparkline data={series} height={26} />
      <div className="kpi-note">{note}</div>
    </div>
  )
}
