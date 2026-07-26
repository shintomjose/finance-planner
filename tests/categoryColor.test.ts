import { describe, expect, it } from 'vitest'
import { categoryColor } from '../src/ui/charts/categoryColor'
import { getPalette } from '../src/ui/charts/palette'

const palette = getPalette('light')

describe('categoryColor', () => {
  it('pins uncategorized and other to the neutral gray, not a categorical hue', () => {
    expect(categoryColor('uncategorized', palette)).toBe(palette.neutral)
    expect(categoryColor('other', palette)).toBe(palette.neutral)
  })

  it('is stable regardless of what else was queried first (not rank-based)', () => {
    // Simulates the bug this replaces: the old `palette.categorical[i % 8]`
    // after a total-desc sort meant the SAME category could get a
    // different color depending on which other categories were present (and
    // how they ranked) in that particular render. A pure category->color
    // function can't do that — querying unrelated categories first must
    // never change what 'groceries' resolves to.
    const before = categoryColor('groceries', palette)
    categoryColor('income', palette)
    categoryColor('family', palette)
    categoryColor('lifestyle', palette)
    const after = categoryColor('groceries', palette)
    expect(after).toBe(before)
  })

  it('gives every real bucket a distinct categorical color', () => {
    const buckets = ['groceries', 'fixed', 'lifestyle', 'family', 'income', 'transfer', 'credit card']
    const colors = buckets.map((b) => categoryColor(b, palette))
    expect(new Set(colors).size).toBe(buckets.length)
    for (const c of colors) expect(palette.categorical).toContain(c)
  })

  it('same category resolves identically across two independent palette instances of the same scheme', () => {
    const paletteA = getPalette('dark')
    const paletteB = getPalette('dark')
    expect(categoryColor('fixed', paletteA)).toBe(categoryColor('fixed', paletteB))
  })
})
