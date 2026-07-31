// Single or grouped bar chart (e.g. planned vs. actual per month). Bars are
// capped thin, 4px rounded at the data-end and square at the baseline, with
// a 2px surface gap between bars in the same group (barGap) — the mark
// spec's two spacers, not a stroke border.
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { getPalette } from './palette'
import { useColorScheme } from './useColorScheme'
import { ChartLegend, ChartTooltip } from './ChartTooltip'

export interface MonthBarSeries {
  key: string
  label: string
}

export interface MonthBarProps {
  data: Record<string, unknown>[]
  xKey: string
  series: MonthBarSeries[]
  height?: number
  valueFormatter?: (v: number) => string
}

export function MonthBar({ data, xKey, series, height = 260, valueFormatter }: MonthBarProps) {
  const palette = getPalette(useColorScheme())
  const rendered = series.slice(0, palette.categorical.length)

  return (
    <div className="chart-block">
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }} barGap={2} barCategoryGap="28%">
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
            cursor={{ fill: palette.gridline, opacity: 0.4 }}
            content={(props) => <ChartTooltip {...props} palette={palette} formatValue={valueFormatter} />}
          />
          {rendered.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              fill={palette.categorical[i]}
              radius={[4, 4, 0, 0]}
              maxBarSize={24}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
      {rendered.length > 1 && (
        <ChartLegend entries={rendered.map((s, i) => ({ key: s.key, label: s.label, color: palette.categorical[i] }))} />
      )}
    </div>
  )
}
