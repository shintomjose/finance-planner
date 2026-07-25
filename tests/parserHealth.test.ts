// ParserHealth v2 (src/ui/ParserHealth.tsx) pure helpers: grouping,
// per-kind counting, and the "Copy report" plaintext formatter. The
// component itself isn't unit-tested here (no jsdom/testing-library in this
// project — see tests/setup.ts) but these three functions carry all of its
// non-trivial logic and are plain data in/out.
import { describe, expect, it } from 'vitest'
import { countByKind, formatReport, groupBySheet } from '../src/ui/ParserHealth'
import type { ParserIssue } from '../src/types'

const issues: ParserIssue[] = [
  { sheet: 'JUN_25', cell: 'B12', kind: 'bad-number', detail: 'not a number' },
  { sheet: 'JAN_22', kind: 'fetch-failed', detail: 'network blip' },
  { sheet: 'JUN_25', cell: 'C4', kind: 'bad-date', detail: 'unparseable date' },
  { sheet: 'SACHIN', kind: 'bad-number', detail: 'ref error' },
]

describe('groupBySheet', () => {
  it('groups by sheet, sheets sorted alphabetically', () => {
    const groups = groupBySheet(issues)
    expect(groups.map((g) => g.sheet)).toEqual(['JAN_22', 'JUN_25', 'SACHIN'])
  })

  it('preserves issue order within a group and issue count matches', () => {
    const groups = groupBySheet(issues)
    const jun25 = groups.find((g) => g.sheet === 'JUN_25')!
    expect(jun25.issues.map((i) => i.cell)).toEqual(['B12', 'C4'])
  })

  it('empty input -> empty output', () => {
    expect(groupBySheet([])).toEqual([])
  })
})

describe('countByKind', () => {
  it('counts each kind across all sheets', () => {
    const counts = countByKind(issues)
    expect(counts.get('bad-number')).toBe(2)
    expect(counts.get('fetch-failed')).toBe(1)
    expect(counts.get('bad-date')).toBe(1)
    expect(counts.size).toBe(3)
  })

  it('empty input -> empty map', () => {
    expect(countByKind([]).size).toBe(0)
  })
})

describe('formatReport', () => {
  it('header row plus one tab-separated row per issue, cell defaulting to empty string', () => {
    const report = formatReport(issues)
    const lines = report.split('\n')
    expect(lines[0]).toBe('Sheet\tCell\tKind\tDetail')
    expect(lines).toHaveLength(issues.length + 1)
    expect(lines[1]).toBe('JUN_25\tB12\tbad-number\tnot a number')
    expect(lines[2]).toBe('JAN_22\t\tfetch-failed\tnetwork blip')
  })

  it('empty input -> just the header row', () => {
    expect(formatReport([])).toBe('Sheet\tCell\tKind\tDetail')
  })
})
