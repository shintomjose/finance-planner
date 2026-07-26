// Stable category -> color lookup, shared by Overview.tsx and Trends.tsx
// (final-review finding: both screens picked a dot color via
// `palette.categorical[i % 8]` after sorting rows by total-desc, so the SAME
// category got a different color depending on that render's ranking — e.g.
// "groceries" could be blue on Overview but green on Trends, or a different
// color month to month as spend shifted which row ranked where). A
// category's color must depend only on its own name, never on which other
// categories happen to be visible (or how they rank) in a given render.
//
// The fix: build the index from the CANONICAL set of buckets categorize()
// (normalize.ts) can ever produce, sorted alphabetically once at module
// load — not from whatever categories a caller's current dataset happens to
// contain. That's what makes it truly stable across screens and months,
// rather than merely "usually the same".
import { SEED_CATEGORIES } from '../../lib/normalize'
import type { ChartPalette } from './palette'

// Catch-all buckets, not a "real" category identity — pinned to the
// palette's neutral gray rather than consuming a categorical hue.
// 'uncategorized' is categorize()'s own fallback; 'other' is trends.ts's
// top-N-rollup bucket (categorySeries) — Trends.tsx's own category-trend
// table asks for topN=999 so 'other' never actually appears there today,
// but the pin still applies for any future/other caller that folds a
// long tail into it.
const PINNED_NEUTRAL = new Set(['uncategorized', 'other'])

const CANONICAL_CATEGORIES = [...new Set(Object.values(SEED_CATEGORIES)), 'uncategorized'].sort((a, b) => a.localeCompare(b))

const COLOR_INDEX = new Map<string, number>(CANONICAL_CATEGORIES.map((cat, i) => [cat, i]))

/** Stable color for `category`. Pure function of `category` + `palette` —
 * deterministic regardless of what else is in the caller's current dataset.
 * A category outside the canonical set (shouldn't happen — categorize()
 * only ever returns a canonical bucket or 'uncategorized') falls back to
 * neutral rather than throwing. */
export function categoryColor(category: string, palette: ChartPalette): string {
  if (PINNED_NEUTRAL.has(category)) return palette.neutral
  const idx = COLOR_INDEX.get(category)
  return idx == null ? palette.neutral : palette.categorical[idx % 8]
}
