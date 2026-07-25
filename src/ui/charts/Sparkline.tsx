// Tiny inline trend line for a StatCard — decorative de-emphasis channel,
// no axes/grid/tooltip (the dataviz "bare stat tile" exception: the value
// text carries the number, the sparkline only carries shape).
import { Line, LineChart, ResponsiveContainer } from 'recharts'
import { getPalette } from './palette'
import { useColorScheme } from './useColorScheme'

export interface SparklineProps {
  data: number[]
  height?: number
  tone?: 'accent' | 'muted'
}

export function Sparkline({ data, height = 32, tone = 'accent' }: SparklineProps) {
  const palette = getPalette(useColorScheme())
  const points = data.map((v, i) => ({ i, v }))
  const stroke = tone === 'accent' ? palette.categorical[0] : palette.textMuted

  if (points.length < 2) return null

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={points} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
        <Line type="monotone" dataKey="v" stroke={stroke} strokeWidth={2} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}
