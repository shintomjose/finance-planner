import { describe, it, expect } from 'vitest'
import { bannerFor } from '../src/lib/banner'
import type { ParserIssue } from '../src/types'

const issue = (sheet: string, kind: ParserIssue['kind']): ParserIssue => ({ sheet, kind, detail: 'x' })

describe('bannerFor', () => {
  it('no issues -> no banner, no chip', () => {
    expect(bannerFor([], 'JUL_26')).toEqual({ bannerForDisplayedTab: false, otherFailedTabCount: 0 })
  })

  it('displayed tab has fetch-failed -> banner, no chip for itself', () => {
    const issues = [issue('JUL_26', 'fetch-failed')]
    expect(bannerFor(issues, 'JUL_26')).toEqual({ bannerForDisplayedTab: true, otherFailedTabCount: 0 })
  })

  it('displayed tab has cache-error -> banner too', () => {
    const issues = [issue('JUL_26', 'cache-error')]
    expect(bannerFor(issues, 'JUL_26')).toEqual({ bannerForDisplayedTab: true, otherFailedTabCount: 0 })
  })

  it('another tab failed, displayed tab fine -> no banner, chip count 1', () => {
    const issues = [issue('JUN_26', 'fetch-failed')]
    expect(bannerFor(issues, 'JUL_26')).toEqual({ bannerForDisplayedTab: false, otherFailedTabCount: 1 })
  })

  it('unrelated issue kind (e.g. bad-number) on any tab never triggers banner or chip', () => {
    const issues = [issue('JUL_26', 'bad-number'), issue('JUN_26', 'bad-number')]
    expect(bannerFor(issues, 'JUL_26')).toEqual({ bannerForDisplayedTab: false, otherFailedTabCount: 0 })
  })

  it('mixed: displayed tab AND two other tabs failed -> banner true, chip counts only the others (deduped per sheet)', () => {
    const issues = [
      issue('JUL_26', 'fetch-failed'),
      issue('JUN_26', 'fetch-failed'),
      issue('JUN_26', 'cache-error'), // same sheet, second kind — still counts once
      issue('MAY_26', 'cache-error'),
    ]
    expect(bannerFor(issues, 'JUL_26')).toEqual({ bannerForDisplayedTab: true, otherFailedTabCount: 2 })
  })
})
