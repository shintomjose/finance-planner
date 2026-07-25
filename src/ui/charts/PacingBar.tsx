// Budget pacing meter — pure CSS (no recharts needed for a single fill
// bar). Fill carries severity (accent -> warning -> critical as spend
// approaches/exceeds plan); the unfilled track is a lighter step of the
// same ramp so state reads across the whole bar, not just the filled part.
// Status color + text label together (never color alone).
export interface PacingBarProps {
  label: string
  plannedEUR: number
  spentEUR: number
  formatValue?: (v: number) => string
}

type Tone = 'good' | 'warning' | 'critical'

function toneFor(ratio: number): Tone {
  if (ratio >= 1) return 'critical'
  if (ratio >= 0.85) return 'warning'
  return 'good'
}

export function PacingBar({ label, plannedEUR, spentEUR, formatValue }: PacingBarProps) {
  const fmt = formatValue ?? ((v: number) => v.toFixed(2))
  const ratio = plannedEUR > 0 ? spentEUR / plannedEUR : spentEUR > 0 ? 1 : 0
  const pct = Math.min(Math.max(ratio, 0), 1) * 100
  const tone = toneFor(ratio)

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
