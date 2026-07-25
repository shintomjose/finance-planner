// Stand-in panel for the 7 modules Tasks 9-13 haven't built yet. Lives in
// its own file (rather than inline in Layout.tsx) so it lazy-loads exactly
// like a real screen and gets swapped out module-by-module without ever
// touching the registry's shape.
import { EmptyState } from '../shared'

export default function Placeholder({ label }: { label: string }) {
  return (
    <div className="screen-placeholder">
      <EmptyState title={label} message="Coming in this build — this module isn't wired up yet." />
    </div>
  )
}
