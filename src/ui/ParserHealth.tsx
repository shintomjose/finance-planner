// Parser Health tab v2 (Plan 2 Task 14): every ParserIssue collected across
// the load — month fetch/parse trouble, special-tab fetch trouble, and all
// six special-tab parsers' own issues (src/data/useAppData.ts's
// `assembleAppData` concatenates all of that into the single `issues` list
// this component receives). v1 (Task 8) was a flat table; v2 adds grouping
// by sheet (collapsible, count in the summary line), a kind filter, and a
// "Copy report" button for pasting a plaintext summary elsewhere.
//
// `groupBySheet`/`countByKind`/`formatReport` are exported as pure functions
// (no React/DOM) so they're unit-testable on their own — see
// tests/parserHealth.test.ts.
import { useMemo, useState } from 'react'
import type { ParserIssue, ParserIssueKind } from '../types'
import { EmptyState, Section } from './shared'

export interface SheetGroup {
  sheet: string
  issues: ParserIssue[]
}

/** Groups issues by `sheet`, sheets sorted alphabetically for a stable,
 * scannable order (the load order of six special tabs + N months isn't
 * meaningful to the reader). Issue order within a group is preserved
 * (first-found order from the aggregate list). */
export function groupBySheet(issues: ParserIssue[]): SheetGroup[] {
  const bySheet = new Map<string, ParserIssue[]>()
  for (const issue of issues) {
    const list = bySheet.get(issue.sheet)
    if (list) list.push(issue)
    else bySheet.set(issue.sheet, [issue])
  }
  return [...bySheet.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([sheet, sheetIssues]) => ({ sheet, issues: sheetIssues }))
}

/** Per-kind counts across `issues`, insertion-ordered by first occurrence
 * (matches the order kinds appear in the kind-filter dropdown). */
export function countByKind(issues: ParserIssue[]): Map<ParserIssueKind, number> {
  const counts = new Map<ParserIssueKind, number>()
  for (const issue of issues) {
    counts.set(issue.kind, (counts.get(issue.kind) ?? 0) + 1)
  }
  return counts
}

/** Plaintext TSV-shaped report (header row + one row per issue) suitable for
 * pasting into a spreadsheet or a chat message — this is exactly what "Copy
 * report" puts on the clipboard. */
export function formatReport(issues: ParserIssue[]): string {
  const lines = ['Sheet\tCell\tKind\tDetail']
  for (const issue of issues) {
    lines.push(`${issue.sheet}\t${issue.cell ?? ''}\t${issue.kind}\t${issue.detail}`)
  }
  return lines.join('\n')
}

const ALL_KINDS = 'all' as const
type KindFilter = ParserIssueKind | typeof ALL_KINDS

function SheetDetails({ group }: { group: SheetGroup }) {
  return (
    <details className="parser-health-group" open>
      <summary className="parser-health-group-summary">
        <span className="parser-health-group-sheet">{group.sheet}</span>
        <span className="parser-health-group-count">{group.issues.length}</span>
      </summary>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Cell</th>
              <th>Kind</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {group.issues.map((issue, i) => (
              <tr key={`${issue.cell ?? ''}-${issue.kind}-${i}`}>
                <td>{issue.cell ?? '–'}</td>
                <td>{issue.kind}</td>
                <td>{issue.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}

export function ParserHealth({ issues }: { issues: ParserIssue[] }) {
  const [kindFilter, setKindFilter] = useState<KindFilter>(ALL_KINDS)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle')

  const kindCounts = useMemo(() => countByKind(issues), [issues])
  const kinds = useMemo(() => [...kindCounts.keys()], [kindCounts])
  const filtered = useMemo(
    () => (kindFilter === ALL_KINDS ? issues : issues.filter((i) => i.kind === kindFilter)),
    [issues, kindFilter],
  )
  const groups = useMemo(() => groupBySheet(filtered), [filtered])

  if (issues.length === 0) {
    return <EmptyState title="All clear" message="All cells parsed cleanly." />
  }

  const handleCopy = () => {
    // navigator.clipboard is absent in some contexts (older browsers,
    // non-secure origins, jsdom-less test environments) — guard rather than
    // let a click throw.
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      setCopyState('error')
      return
    }
    navigator.clipboard
      .writeText(formatReport(filtered))
      .then(() => setCopyState('copied'))
      .catch(() => setCopyState('error'))
  }

  return (
    <section className="parser-health">
      <Section
        title={`${filtered.length} issue${filtered.length === 1 ? '' : 's'} across ${groups.length} sheet${groups.length === 1 ? '' : 's'}`}
        actions={
          <div className="parser-health-controls">
            <label className="parser-health-filter">
              Kind
              <select
                className="parser-health-select"
                value={kindFilter}
                onChange={(e) => setKindFilter(e.target.value as KindFilter)}
              >
                <option value={ALL_KINDS}>All ({issues.length})</option>
                {kinds.map((k) => (
                  <option key={k} value={k}>
                    {k} ({kindCounts.get(k)})
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="parser-health-copy-btn" onClick={handleCopy}>
              {copyState === 'copied' ? 'Copied!' : copyState === 'error' ? 'Copy failed' : 'Copy report'}
            </button>
          </div>
        }
      >
        <div className="parser-health-kind-counts">
          {kinds.map((k) => (
            <span key={k} className="parser-health-kind-badge">
              {k}: {kindCounts.get(k)}
            </span>
          ))}
        </div>
      </Section>

      {groups.map((group) => (
        <SheetDetails key={group.sheet} group={group} />
      ))}
    </section>
  )
}
