// Shared themed tooltip + legend for every recharts wrapper — one hover
// treatment across the app instead of a bespoke one per chart (dataviz:
// "the hover layer is part of the deliverable"). Values lead, series name
// follows; each row keys with a short stroke of the series color rather
// than a filled box (dataviz interaction.md: "line keys, not boxes").
import type { TooltipProps } from 'recharts'
import type { ChartPalette } from './palette'

// recharts doesn't export its ValueType/NameType generics from the
// package root (only from an internal component path), so they're
// restated here to match `DefaultTooltipContent`'s definitions.
type RechartsValue = number | string | Array<number | string>
type RechartsName = number | string

export interface ChartLegendEntry {
  key: string
  label: string
  color: string
}

interface ChartTooltipProps extends Partial<TooltipProps<RechartsValue, RechartsName>> {
  palette: ChartPalette
  formatValue?: (v: number) => string
}

/** Themed content renderer for recharts' `<Tooltip content={...}>`. Wrap it
 * in a closure at the call site to inject `palette`/`formatValue`:
 * `content={(props) => <ChartTooltip {...props} palette={palette} />}` */
export function ChartTooltip({ active, label, payload, palette, formatValue }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null
  const fmt = formatValue ?? ((v: number) => String(v))

  return (
    <div
      className="chart-tooltip"
      style={{ background: palette.surface, borderColor: palette.gridline, color: palette.textPrimary }}
    >
      {label != null && (
        <div className="chart-tooltip-label" style={{ color: palette.textSecondary }}>
          {String(label)}
        </div>
      )}
      <ul>
        {payload.map((p, i) => {
          const raw = typeof p.value === 'number' ? p.value : Number(p.value)
          return (
            <li key={`${String(p.dataKey ?? p.name ?? i)}`}>
              <span className="chart-tooltip-key" style={{ background: p.color ?? palette.categorical[0] }} />
              <span className="chart-tooltip-name" style={{ color: palette.textSecondary }}>
                {p.name}
              </span>
              <span className="chart-tooltip-value">{Number.isFinite(raw) ? fmt(raw) : '–'}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** Text-token legend — swatches carry the series color, labels stay in ink
 * (dataviz: "text never wears the data color"). Always present for 2+
 * series; callers skip rendering it for a single series. */
export function ChartLegend({ entries }: { entries: ChartLegendEntry[] }) {
  return (
    <ul className="chart-legend">
      {entries.map((e) => (
        <li key={e.key}>
          <span className="chart-legend-swatch" style={{ background: e.color }} />
          {e.label}
        </li>
      ))}
    </ul>
  )
}
