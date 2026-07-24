// Cached-data banner precision (Plan 2 Task 1 hygiene backlog). The old
// App.tsx logic fired the banner whenever ANY tab in the whole load had a
// 'fetch-failed' issue, even if the month actually on screen loaded fine —
// e.g. one dead 2019 tab would banner the user every session forever.
// bannerFor scopes the banner to the DISPLAYED tab only; every other tab's
// fetch-failed becomes a small nav-side counter instead.
//
// 'cache-error' is deliberately EXCLUDED here (review fix, Plan 2 Task 1):
// it means "fetched fresh this run, failed to persist to IndexedDB" — the
// data on screen is current, not stale, so "showing cached data" would be
// false, and counting it as a "failed to load" tab in the chip would be
// equally wrong. cache-error stays visible in Parser Health, where it
// belongs, and nowhere else.
import type { ParserIssue } from '../types'

const STALE_DATA_KINDS = new Set<ParserIssue['kind']>(['fetch-failed'])

export interface BannerState {
  /** Show the "showing cached data" banner — the tab currently on screen
   * itself failed to refresh. */
  bannerForDisplayedTab: boolean
  /** Count of OTHER tabs (distinct sheets, excluding the displayed one)
   * that failed to refresh — rendered as a small nav chip, not the banner. */
  otherFailedTabCount: number
}

export function bannerFor(issues: ParserIssue[], displayedTab: string): BannerState {
  const failedTabs = new Set<string>()
  for (const issue of issues) {
    if (STALE_DATA_KINDS.has(issue.kind)) failedTabs.add(issue.sheet)
  }
  const bannerForDisplayedTab = failedTabs.has(displayedTab)
  const otherFailedTabCount = failedTabs.size - (bannerForDisplayedTab ? 1 : 0)
  return { bannerForDisplayedTab, otherFailedTabCount }
}
