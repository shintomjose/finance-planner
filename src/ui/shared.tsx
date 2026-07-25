// Shared, chrome-only building blocks used across screens: money
// formatting, stat tiles, section chrome, and empty/loading placeholders.
// Deliberately has NO import of recharts or anything in ./charts — this
// module is reachable from the eager App/Layout shell, and pulling
// recharts in here would put it in the initial bundle instead of a lazy
// screen chunk. A caller that wants a chart inside a StatCard imports
// Sparkline itself and passes it as the `trend` node.
import type { ReactNode } from 'react'

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
  children: ReactNode
}

export function Section({ title, actions, children }: SectionProps) {
  return (
    <section className="section">
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
