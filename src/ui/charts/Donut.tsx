// Composition chart (e.g. expense by category). Wedges take fixed
// categorical slots by descending value; beyond 8 slices the tail folds
// into a neutral "Other" bucket rather than generating a 9th hue. The 2px
// gap between wedges is painted in the surface color (the mark spec's
// "surface gap" mechanism), not a contrasting border.
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { getPalette } from './palette'
import { useColorScheme } from './useColorScheme'
import { ChartLegend, ChartTooltip } from './ChartTooltip'

export interface DonutSlice {
  key: string
  label: string
  value: number
}

export interface DonutProps {
  data: DonutSlice[]
  height?: number
  valueFormatter?: (v: number) => string
  centerLabel?: string
}

const OTHER_KEY = '__other__'

export function Donut({ data, height = 240, valueFormatter, centerLabel }: DonutProps) {
  const palette = getPalette(useColorScheme())
  const fmt = valueFormatter ?? ((v: number) => String(v))

  const sorted = [...data].sort((a, b) => b.value - a.value)
  const cap = palette.categorical.length - 1 // reserve one visual slot for "Other"
  const head = sorted.length > palette.categorical.length ? sorted.slice(0, cap) : sorted
  const otherTotal = sorted.length > palette.categorical.length ? sorted.slice(cap).reduce((s, d) => s + d.value, 0) : 0
  const slices = otherTotal > 0 ? [...head, { key: OTHER_KEY, label: 'Other', value: otherTotal }] : head
  const total = slices.reduce((s, d) => s + d.value, 0)
  const colorFor = (key: string, i: number) => (key === OTHER_KEY ? palette.neutral : palette.categorical[i])

  return (
    <div className="chart-block chart-block-donut">
      <div className="chart-donut-plot" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip content={(props) => <ChartTooltip {...props} palette={palette} formatValue={fmt} />} />
            <Pie
              data={slices}
              dataKey="value"
              nameKey="label"
              innerRadius="62%"
              outerRadius="90%"
              paddingAngle={2}
              stroke={palette.surface}
              strokeWidth={2}
              isAnimationActive={false}
            >
              {slices.map((s, i) => (
                <Cell key={s.key} fill={colorFor(s.key, i)} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        {centerLabel && <div className="chart-donut-center">{centerLabel}</div>}
      </div>
      <ChartLegend
        entries={slices.map((s, i) => ({
          key: s.key,
          label: `${s.label} · ${total > 0 ? Math.round((s.value / total) * 100) : 0}%`,
          color: colorFor(s.key, i),
        }))}
      />
    </div>
  )
}
