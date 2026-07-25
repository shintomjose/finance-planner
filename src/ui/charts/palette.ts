// Single source of chart color for the whole app (dataviz skill: "one
// palette system, no per-screen ad-hoc colors"). Values are the dataviz
// skill's reference palette (references/palette.md) — validated with
// scripts/validate_palette.js for both chart surfaces:
//   light: worst adjacent CVD dE 9.1, normal-vision floor 19.6, contrast WARN
//          on 3 slots (relief = legend + tooltip text, always shipped)
//   dark:  worst adjacent CVD dE 8.4, normal-vision floor 19.3, contrast PASS
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

const LIGHT: ChartPalette = {
  categorical: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'],
  sequential: ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'],
  status: { good: '#0ca30c', warning: '#fab219', serious: '#ec835a', critical: '#d03b3b' },
  neutral: '#898781',
  surface: '#fcfcfb',
  gridline: '#e1e0d9',
  axis: '#c3c2b7',
  textPrimary: '#0b0b0b',
  textSecondary: '#52514e',
  textMuted: '#898781',
  deltaGood: '#006300',
  deltaBad: '#b00020',
}

const DARK: ChartPalette = {
  categorical: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
  sequential: ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'],
  status: { good: '#0ca30c', warning: '#fab219', serious: '#ec835a', critical: '#d03b3b' },
  neutral: '#898781',
  surface: '#1a1a19',
  gridline: '#2c2c2a',
  axis: '#383835',
  textPrimary: '#ffffff',
  textSecondary: '#c3c2b7',
  textMuted: '#898781',
  deltaGood: '#0ca30c',
  deltaBad: '#e66767',
}

export function getPalette(scheme: ColorScheme): ChartPalette {
  return scheme === 'dark' ? DARK : LIGHT
}
