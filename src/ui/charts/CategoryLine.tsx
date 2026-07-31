// Multi-series time chart (e.g. income vs. expense across months). One
// consistent thin-line treatment everywhere: 2px monotone lines, no dots
// except the hovered point, a crosshair + shared tooltip, and a text-token
// legend whenever there's more than one series.
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { getPalette } from './palette'
import { useColorScheme } from './useColorScheme'
import { ChartLegend, ChartTooltip } from './ChartTooltip'

export interface CategoryLineSeries {
  key: string
  label: string
}

export interface CategoryLineProps {
  data: Record<string, unknown>[]
  xKey: string
  series: CategoryLineSeries[]
  height?: number
  valueFormatter?: (v: number) => string
}

export function CategoryLine({ data, xKey, series, height = 260, valueFormatter }: CategoryLineProps) {
  const palette = getPalette(useColorScheme())
  // Categorical hues are assigned by position and never cycled — an 8-slot
  // palette caps series identity at 8; a caller with more should aggregate
  // the tail into a synthetic "Other" series before calling.
  const rendered = series.slice(0, palette.categorical.length)

  return (
    <div className="chart-block">
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={palette.gridline} vertical={false} />
          <XAxis
            dataKey={xKey}
            stroke={palette.axis}
            tick={{ fill: palette.textMuted, fontSize: 13 }}
            tickLine={false}
            axisLine={{ stroke: palette.axis }}
          />
          <YAxis
            stroke={palette.axis}
            tick={{ fill: palette.textMuted, fontSize: 13 }}
            tickLine={false}
            axisLine={false}
            width={48}
          />
          <Tooltip
            cursor={{ stroke: palette.axis, strokeWidth: 1 }}
            content={(props) => <ChartTooltip {...props} palette={palette} formatValue={valueFormatter} />}
          />
          {rendered.map((s, i) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={palette.categorical[i]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: palette.surface }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      {rendered.length > 1 && (
        <ChartLegend entries={rendered.map((s, i) => ({ key: s.key, label: s.label, color: palette.categorical[i] }))} />
      )}
    </div>
  )
}
