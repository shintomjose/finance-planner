// Single source of chart color for the whole app (dataviz skill: "one
// palette system, no per-screen ad-hoc colors"). Values are derived from
// the app's template design tokens (src/ui/app.css `:root[data-theme]`)
// so chart marks read as part of the same visual system as the app chrome,
// not a second unrelated palette bolted on top.
// Categorical hues are assigned in this fixed order and never cycled or
// re-sorted by value — identity, not rank. Status colors are a separate
// reserved scale, never reused as a series color.
export type ColorScheme = 'light' | 'dark'

export interface ChartPalette {
  /** 8 fixed-order categorical hues. Slice by position (`categorical[i]`),
   * never re-sort by value. Beyond 8 series, fold the remainder into an
   * "Other" bucket using `neutral` rather than generating a 9th hue. */
  categorical: string[]
  /** Single-hue sequential ramp (blue), steps 100 (near-surface) -> 700
   * (darkest), for magnitude encodings (heatmap-style, not used by the
   * wrappers below yet but reserved for future screens). */
  sequential: string[]
  /** Reserved state scale — never themed, never reused for "series N".
   * Always ship with an icon + label, not color alone. */
  status: { good: string; warning: string; serious: string; critical: string }
  /** Neutral gray for "Other" buckets and de-emphasized marks. */
  neutral: string
  /** Chart surface (card background the marks sit on). */
  surface: string
  /** Hairline gridlines — one step off the surface, recessive. */
  gridline: string
  /** Axis / baseline line color. */
  axis: string
  textPrimary: string
  textSecondary: string
  textMuted: string
  /** Delta-up-is-good text color (separate from status.good — this is the
   * chart-chrome "success text" role, not a reserved state chip). */
  deltaGood: string
  deltaBad: string
}

const DARK: ChartPalette = {
  categorical: ['#7fb7ff', '#a8604f', '#5ec98a', '#c9a45e', '#8f7fc4', '#5eb8c9', '#c95e93', '#9ab05e'],
  sequential: ['#16202e', '#1f3350', '#2a4a75', '#38639c', '#4a7ec2', '#639ae4', '#7fb7ff'],
  status: { good: '#5ec98a', warning: '#c9a45e', serious: '#d8705e', critical: '#e05252' },
  neutral: '#6c7180',
  surface: '#101115',
  gridline: '#1c1e24',
  axis: '#2a2d34',
  textPrimary: '#e8e8ea',
  textSecondary: '#a9abb4',
  textMuted: '#8b8d96',
  deltaGood: '#5ec98a',
  deltaBad: '#d8705e',
}

const LIGHT: ChartPalette = {
  categorical: ['#2a6fc0', '#a05240', '#2e7d54', '#9a7728', '#6a5aa8', '#2e7f93', '#a8446e', '#6d7f37'],
  sequential: ['#dbe8f8', '#b7d1f0', '#8fb5e5', '#6698d7', '#437cc4', '#2a6fc0', '#1d569c'],
  status: { good: '#2e7d54', warning: '#9a7728', serious: '#b8503e', critical: '#a52929' },
  neutral: '#8e9098',
  surface: '#ffffff',
  gridline: '#ececea',
  axis: '#d5d5d1',
  textPrimary: '#1d1e22',
  textSecondary: '#45464c',
  textMuted: '#6b6d75',
  deltaGood: '#2e7d54',
  deltaBad: '#b8503e',
}

export function getPalette(scheme: ColorScheme): ChartPalette {
  return scheme === 'dark' ? DARK : LIGHT
}
