import { describe, it, expect } from 'vitest'
import { readDateAt } from '../src/parse/cells'
import type { ParserIssue } from '../src/types'

const SHEET = 'TEST_SHEET'

describe('readDateAt — serial-date plausibility window (2015-2040)', () => {
  it('parses a numeric serial that lands in-window (2026-03-15) with no issue', () => {
    const values = [[46096]]
    const issues: ParserIssue[] = []
    const date = readDateAt(values, 'A1', SHEET, issues)
    expect(date).toBe('2026-03-15')
    expect(issues).toHaveLength(0)
  })

  it('a plain amount (2000) that happens to be a numeric cell in a date column converts to a wildly implausible 1905 date -> null + ambiguous-date issue instead of garbage', () => {
    const values = [[2000]]
    const issues: ParserIssue[] = []
    const date = readDateAt(values, 'A1', SHEET, issues)
    expect(date).toBeNull()
    expect(issues).toContainEqual({
      sheet: SHEET, cell: 'A1', kind: 'ambiguous-date',
      detail: expect.stringContaining('1905'), raw: 2000,
    })
  })
})
