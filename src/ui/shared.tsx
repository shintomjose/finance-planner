// Shared, chrome-only building blocks used across screens: money
// formatting, stat tiles, section chrome, and empty/loading placeholders.
// StatCard still takes a pre-rendered `trend` node so screens that only
// need a plain stat tile never pull in recharts. KpiCardView (Task 6) is
// the one exception: it renders its own <Sparkline> directly. Layout
// imports KpiRow (which renders KpiCardView) eagerly today, so recharts
// currently ships in the main bundle rather than a lazy screen chunk —
// KpiRow *could* be made its own lazy import inside Layout's existing
// screen Suspense boundary to claw that back, but Task 6 didn't do that,
// so treat this file as no longer recharts-free until/unless a future
// task adds that lazy boundary.
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
    if (amountINR == null) return <span className="money money-dash">—</span>
    const eur = fxRate != null && Number.isFinite(fxRate) && fxRate !== 0 ? amountINR / fxRate : null
    return (
      <span className={cls}>
        {inrFmt.format(amountINR)}
        {eur != null && <span className="money-secondary">≈ {eurFmt.format(eur)}</span>}
      </span>
    )
  }

  if (amountEUR == null) return <span className="money money-dash">—</span>
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
      {/* `kicker` (template redesign, Task 10): same small-caps meta-label
          treatment as KpiCardView's label and the panel2-meta counts —
          StatCard's tiles now read as the same family of tile as the
          global KPI row instead of the old dedicated stat-card-label look. */}
      <div className="kicker">{label}</div>
      <div className="stat-card-value num">{value}</div>
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

/** Deliberately NOT wrapped in `.panel2`'s bordered-card chrome (Task 10
 * reskin pass): app.css's own typography note ("a warm serif carries the
 * ledger identity — headings, section titles") means Section's job is a
 * page-level heading + content grouping, not a dashboard tile — the six
 * screens that use it (NetWorth/Sachin/Trips/Logs/Goals/ParserHealth) each
 * stack several Sections top-to-bottom, so boxing every one would nest a
 * border around StatCard's own bordered tiles and double up the chrome
 * for no visual gain (the global KPI row already establishes "small
 * bordered tile on plain background" as the template's stat-tile
 * convention, with no further panel2 wrapper around it either). Section
 * still inherits the template look through tokens (fonts/colors already
 * flow through the CSS variable remap) without changing shape. */
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

/** Dashboard-grid building block: a bordered card with a header that never
 * scrolls and a body that scrolls internally (`overflow-y: auto`) once its
 * container gets a bounded height — see `.panel2` / `.panel2-head` /
 * `.panel2-body` in app.css. Kept here (not local to Overview.tsx) because
 * the pattern is generically useful for any screen that wants a
 * fixed-height scrollable card. No screen instantiates `Panel` today —
 * Overview/Budget/Trends all lay out their own `.panel2` markup directly
 * instead of going through this component — but it now shares the same
 * `.panel2`/`.panel2-head` chrome those screens use (Task 10 reskin) rather
 * than the old pre-redesign `.panel`/`.panel-head` look, so any future
 * caller gets the current template for free. */
export function Panel({ title, className, children }: PanelProps) {
  return (
    <div className={className ? `panel2 ${className}` : 'panel2'}>
      <div className="panel2-head">
        <span>{title}</span>
      </div>
      <div className="panel2-body">{children}</div>
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
