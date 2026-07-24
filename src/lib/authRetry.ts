// Silent-reauth retry orchestration (Plan 2 Task 1 hygiene backlog). Pure
// and framework-free so it's unit-testable without a DOM/GIS environment —
// App.tsx wires in the real loadMonths()/silentReauth() (src/api/gis.ts).
//
// Policy: an auth-expired failure gets exactly one silent reauth attempt and
// exactly one retry of `run()`. Whatever happens next — the retry succeeds,
// the retry fails with a non-auth error, or the retry fails with
// AuthExpiredError again — this function does NOT attempt a second silent
// reauth. That's the loop guard: at most one round-trip to the identity
// provider per call, ever.
export type SilentReauthOutcome<T> = { status: 'ok'; value: T } | { status: 'unauthenticated' }

export async function loadWithSilentReauth<T>(
  run: () => Promise<T>,
  silentReauth: () => Promise<string | null>,
  isAuthExpired: (err: unknown) => boolean,
): Promise<SilentReauthOutcome<T>> {
  try {
    return { status: 'ok', value: await run() }
  } catch (err) {
    if (!isAuthExpired(err)) throw err
    const token = await silentReauth()
    if (!token) return { status: 'unauthenticated' }
    try {
      return { status: 'ok', value: await run() }
    } catch (err2) {
      if (!isAuthExpired(err2)) throw err2
      return { status: 'unauthenticated' }
    }
  }
}
