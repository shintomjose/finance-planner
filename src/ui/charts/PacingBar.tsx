// Budget pacing meter — pure CSS (no recharts needed for a single fill
// bar). Fill carries severity, but which direction is "severe" depends on
// what's being paced (review fix, Task 13): more filled is bad for a
// budget (you're spending toward/past a limit) but GOOD for a goal or a
// completion count (you're arriving at/finishing something you want). The
// `direction` prop picks the ramp:
//   'spend' (default — Budget.tsx): ratio>=1 'critical' (over budget),
//     ratio>=0.85 'warning' (close to over), else 'good' (room to spare).
//   'fill' (Goals.tsx progress, Sachin.tsx EMI completion): ratio>=1 'good'
//     (target reached/exceeded), ratio>=0.5 'neutral' (solid progress, no
//     flag needed), else 'warning' (early days — a gentle nudge, not an
//     alarm; 'critical' is never used here, since being new to a goal
//     isn't a failure the way overspending is).
// The unfilled track is a lighter step of the active tone's ramp so state
// reads across the whole bar, not just the filled part. Status color + text
// label together always (never color alone).
export type PacingTone = 'good' | 'warning' | 'critical' | 'neutral'
export type PacingDirection = 'spend' | 'fill'

export interface PacingBarProps {
  label: string
  plannedEUR: number
  spentEUR: number
  formatValue?: (v: number) => string
  /** 'spend' (default, unchanged behavior) or 'fill' — see file header for
   * the two ratio -> tone maps. */
  direction?: PacingDirection
}

/** Pure ratio -> tone mapping, exported so the two direction maps' exact
 * boundaries can be locked down by a unit test without rendering anything. */
export function toneFor(ratio: number, direction: PacingDirection = 'spend'): PacingTone {
  if (direction === 'fill') {
    if (ratio >= 1) return 'good'
    if (ratio >= 0.5) return 'neutral'
    return 'warning'
  }
  if (ratio >= 1) return 'critical'
  if (ratio >= 0.85) return 'warning'
  return 'good'
}

export function PacingBar({ label, plannedEUR, spentEUR, formatValue, direction = 'spend' }: PacingBarProps) {
  const fmt = formatValue ?? ((v: number) => v.toFixed(2))
  const ratio = plannedEUR > 0 ? spentEUR / plannedEUR : spentEUR > 0 ? 1 : 0
  const pct = Math.min(Math.max(ratio, 0), 1) * 100
  const tone = toneFor(ratio, direction)

  return (
    <div className="pacing-bar" data-tone={tone}>
      <div className="pacing-bar-head">
        <span className="pacing-bar-label">{label}</span>
        <span className="pacing-bar-value">
          {fmt(spentEUR)} <span className="pacing-bar-of">of {fmt(plannedEUR)}</span>
        </span>
      </div>
      <div
        className="pacing-bar-track"
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div className="pacing-bar-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
