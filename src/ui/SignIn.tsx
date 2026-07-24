// Unauthenticated screen: sign-in button + optional note (e.g. "session
// expired") + a setup hint when CONFIG isn't filled in yet (Task 11 fills
// sheetId/clientId; until then the button is still shown, per brief — it
// just won't produce usable data).
import { signIn } from '../api/gis'
import { CONFIG } from '../config'

const PLACEHOLDER = '<FILLED BY USER>'

export function SignIn({ note }: { note?: string }) {
  const needsSetup = CONFIG.sheetId === PLACEHOLDER || CONFIG.clientId === PLACEHOLDER

  return (
    <div className="signin">
      <h1>Finance Planner</h1>
      {note && <p className="note">{note}</p>}
      <button onClick={signIn}>Sign in with Google</button>
      {needsSetup && (
        <p className="hint">
          Setup incomplete: CONFIG.sheetId / CONFIG.clientId in src/config.ts are still placeholders.
          Sign-in will work, but no spreadsheet data can load until they're filled in.
        </p>
      )}
    </div>
  )
}
