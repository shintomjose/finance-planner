// Parser Health tab: flat table of every ParserIssue collected across the
// load (fetch/tab-level issues plus each month's own parse issues — the
// orchestrator already aggregates both into LoadResult.issues). Visuals
// only were touched for the Task 8 design-system pass.
import type { ParserIssue } from '../types'
import { EmptyState } from './shared'

export function ParserHealth({ issues }: { issues: ParserIssue[] }) {
  if (issues.length === 0) {
    return <EmptyState title="All clear" message="All cells parsed cleanly." />
  }

  return (
    <section className="parser-health">
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Sheet</th>
              <th>Cell</th>
              <th>Kind</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {issues.map((issue, i) => (
              <tr key={`${issue.sheet}-${issue.cell ?? ''}-${issue.kind}-${i}`}>
                <td>{issue.sheet}</td>
                <td>{issue.cell ?? '–'}</td>
                <td>{issue.kind}</td>
                <td>{issue.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
