// Sheets API v4 client (SKILL.md "Sheets API + GIS pattern"). Read-only:
// spreadsheets.get (tab listing) + spreadsheets.values.batchGet (grid +
// formula reads). Auth is injected via a `getToken` callback (see
// src/api/gis.ts) so this module has no browser-only dependencies and stays
// fully unit-testable with a mocked `fetch`.
import { CONFIG } from '../config'
import { isMonthTab } from '../lib/period'
import type { MonthGrids } from '../parse/month'

/** Thrown whenever the API responds 401 — the caller should re-run auth
 * (gis.ts signIn()) and retry. */
export class AuthExpiredError extends Error {
  constructor(message = 'Sheets API token expired or missing') {
    super(message)
    this.name = 'AuthExpiredError'
  }
}

/** Thrown when a requested tab doesn't exist in the spreadsheet — surfaces
 * as a 400 "Unable to parse range" from batchGet. */
export class TabNotFoundError extends Error {
  constructor(tab: string) {
    super(`Tab "${tab}" not found in spreadsheet`)
    this.name = 'TabNotFoundError'
  }
}

export type JsonValue = string | number | null

interface ValueRange { values?: JsonValue[][] }
interface BatchGetResponse { valueRanges?: ValueRange[] }
interface SpreadsheetGetResponse { sheets?: { properties?: { title?: string } }[] }

/** Ranges read for the formula grid, in the fixed order the API returns
 * their valueRanges — position drives the key mapping below. */
const FORMULA_KEYS = ['B3', 'B4', 'G4', 'G6'] as const

/** Max number of retries after an initial 429 (so up to MAX_429_RETRIES + 1
 * requests total go out for a single logical call). */
const MAX_429_RETRIES = 3

export class SheetsClient {
  private base = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.sheetId}`
  private getToken: () => string | null
  private fetchFn: typeof fetch
  private sleepFn: (ms: number) => Promise<void>

  constructor(
    getToken: () => string | null,
    // Wrap instead of referencing `fetch` directly: storing the bare function
    // and calling it as `this.fetchFn(...)` rebinds `this` to the client and
    // browsers throw "Illegal invocation" (fetch requires `this === window`).
    fetchFn: typeof fetch = (...args) => fetch(...args),
    sleepFn: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  ) {
    this.getToken = getToken
    this.fetchFn = fetchFn
    this.sleepFn = sleepFn
  }

  /** GET wrapper: attaches the bearer token (if any), retries on 429 with
   * backoff, and translates 401/400 into AuthExpiredError/TabNotFoundError.
   * `tab` is only passed by callers that are requesting a specific tab
   * (fetchMonthGrids) — a 400 there means "Unable to parse range" for that
   * tab, i.e. TabNotFoundError. A 400 with no `tab` (listMonthTabs, which
   * addresses the whole spreadsheet, not a tab) is some other bad-request
   * condition and surfaces as a generic Error carrying the status, not a
   * misleading TabNotFoundError.
   *
   * On 429 (rate limited), retries the same request up to MAX_429_RETRIES
   * times, waiting the `Retry-After` header (seconds) if present, else
   * exponential backoff 1s/2s/4s. After exhausting retries, rejects with a
   * generic Error rather than surfacing the raw 429. */
  private async request(url: string, tab?: string): Promise<any> {
    const token = this.getToken()
    const headers: Record<string, string> = {}
    if (token) headers.Authorization = `Bearer ${token}`

    for (let retry = 0; ; retry++) {
      const res = await this.fetchFn(url, { headers })
      if (res.status === 429) {
        if (retry >= MAX_429_RETRIES) throw new Error(`Sheets API rate limited (429) after ${MAX_429_RETRIES} retries: ${url}`)
        const retryAfter = res.headers.get('Retry-After')
        const waitMs = retryAfter ? Number(retryAfter) * 1000 : 2 ** retry * 1000
        await this.sleepFn(waitMs)
        continue
      }
      if (res.status === 401) throw new AuthExpiredError()
      if (res.status === 400) {
        if (tab) throw new TabNotFoundError(tab)
        throw new Error(`Sheets API error ${res.status}: ${url}`)
      }
      if (!res.ok) {
        // Include the API's own reason (SERVICE_DISABLED, PERMISSION_DENIED,
        // ACCESS_TOKEN_SCOPE_INSUFFICIENT, …) — status alone is undiagnosable.
        const body = await res.text().catch(() => '')
        const reason = body.slice(0, 300)
        throw new Error(`Sheets API error ${res.status}${reason ? `: ${reason}` : ''} (${url})`)
      }
      return res.json()
    }
  }

  /** spreadsheets.get, fields-limited to titles → isMonthTab AND-filtered
   * against CONFIG.deadTabs. */
  async listMonthTabs(): Promise<string[]> {
    const url = `${this.base}?fields=${encodeURIComponent('sheets.properties.title')}`
    const data = (await this.request(url)) as SpreadsheetGetResponse
    const titles = (data.sheets ?? []).map((s) => s.properties?.title ?? '').filter(Boolean)
    return titles.filter((t) => isMonthTab(t) && !CONFIG.deadTabs.includes(t))
  }

  /** Single-tab convenience wrapper around fetchManyMonthGrids, preserving
   * its historical contract: rejects directly with TabNotFoundError (rather
   * than returning it via `failures`) when the tab doesn't exist. */
  async fetchMonthGrids(tab: string): Promise<MonthGrids> {
    const { grids, failures } = await this.fetchManyMonthGrids([tab])
    const failure = failures.get(tab)
    if (failure) throw failure
    const grid = grids.get(tab)
    if (!grid) throw new Error(`Sheets API returned no data for tab "${tab}"`)
    return grid
  }

  /** Cross-tab batching (rate-limit fix): fetches grids for MANY tabs with
   * exactly 2 HTTP requests total — one values:batchGet spanning every
   * tab's `A1:P100` range, one spanning every tab's 3 formula cells
   * (B3:B4, G4, G6) — instead of 2 requests PER tab. The API returns
   * valueRanges positionally, in request order, even for empty ranges, so
   * results are mapped back onto tabs by index (same assumption
   * fetchMonthGrids/mapFormulas already relied on for a single tab).
   *
   * Empty `tabs` resolves immediately with empty maps — no HTTP call.
   *
   * Error handling: AuthExpiredError always propagates (caller re-auths).
   * For a single-tab call, any other error propagates directly (preserves
   * fetchMonthGrids's historical throw-based contract, notably 400 →
   * TabNotFoundError). For a multi-tab batch, a single bad tab (400 —
   * "Unable to parse range") would otherwise sink every tab in the batch;
   * instead we retry the batch one tab at a time and collect each tab's
   * outcome into `grids` (success) or `failures` (error, e.g.
   * TabNotFoundError) so one bad tab never blocks the rest. */
  async fetchManyMonthGrids(tabs: string[]): Promise<ManyGridsResult> {
    if (tabs.length === 0) return { grids: new Map(), failures: new Map() }

    try {
      return await this.fetchManyMonthGridsBatch(tabs)
    } catch (err) {
      if (err instanceof AuthExpiredError) throw err
      if (tabs.length === 1) throw err // nothing to fall back to — propagate as-is

      const grids = new Map<string, MonthGrids>()
      const failures = new Map<string, Error>()
      for (const tab of tabs) {
        try {
          const single = await this.fetchManyMonthGrids([tab])
          const grid = single.grids.get(tab)
          if (grid) grids.set(tab, grid)
        } catch (e) {
          if (e instanceof AuthExpiredError) throw e
          failures.set(tab, e instanceof Error ? e : new Error(String(e)))
        }
      }
      return { grids, failures }
    }
  }

  /** The actual 2-request batchGet pair for a group of tabs, with no
   * fallback logic — a failure here (400, 401, etc.) simply throws, letting
   * fetchManyMonthGrids decide whether to retry per-tab. */
  private async fetchManyMonthGridsBatch(tabs: string[]): Promise<ManyGridsResult> {
    const quotedTabs = tabs.map((tab) => `'${tab}'`)
    // Only a single-tab batch can attribute a 400 to a specific tab.
    const soleTab = tabs.length === 1 ? tabs[0] : undefined

    const valuesRanges = quotedTabs.map((q) => `${q}!A1:P100`)
    const valuesQuery = valuesRanges.map((r) => `ranges=${encodeURIComponent(r)}`).join('&')
    const valuesUrl =
      `${this.base}/values:batchGet?${valuesQuery}` +
      `&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`
    const valuesData = (await this.request(valuesUrl, soleTab)) as BatchGetResponse
    const valueRanges = valuesData.valueRanges ?? []

    const formulaRanges: string[] = []
    for (const q of quotedTabs) formulaRanges.push(`${q}!B3:B4`, `${q}!G4`, `${q}!G6`)
    const formulaRangesQuery = formulaRanges.map((r) => `ranges=${encodeURIComponent(r)}`).join('&')
    const formulasUrl = `${this.base}/values:batchGet?${formulaRangesQuery}&valueRenderOption=FORMULA`
    const formulasData = (await this.request(formulasUrl, soleTab)) as BatchGetResponse
    const formulaValueRanges = formulasData.valueRanges ?? []

    const grids = new Map<string, MonthGrids>()
    tabs.forEach((tab, i) => {
      const values = (valueRanges[i]?.values ?? []) as MonthGrids['values']
      const formulas = mapFormulas(formulaValueRanges.slice(i * 3, i * 3 + 3))
      grids.set(tab, { values, formulas })
    })

    return { grids, failures: new Map() }
  }

  /** Generic positional batchGet: one HTTP call for `ranges.length` ranges,
   * result[i] corresponds to ranges[i] (the API returns valueRanges in
   * request order, same assumption fetchManyMonthGridsBatch relies on).
   * `render` defaults to UNFORMATTED_VALUE (numbers as numbers); pass
   * 'FORMULA' for a formula-text read. A range whose valueRange comes back
   * with no `values` (the tab exists but the range is genuinely empty, or —
   * for tabs the caller expects to always have data, per specialTabs.ts —
   * a signal something's wrong) maps to `null` rather than `[]`, so callers
   * needing to tell "no data" apart from "empty tab" can do so. Empty
   * `ranges` resolves to `[]` with no HTTP call, matching
   * fetchManyMonthGrids's empty-input contract. */
  async fetchRanges(ranges: string[], render: 'UNFORMATTED_VALUE' | 'FORMULA' = 'UNFORMATTED_VALUE'): Promise<(JsonValue[][] | null)[]> {
    if (ranges.length === 0) return []
    const query = ranges.map((r) => `ranges=${encodeURIComponent(r)}`).join('&')
    const url = `${this.base}/values:batchGet?${query}&valueRenderOption=${render}`
    const data = (await this.request(url)) as BatchGetResponse
    const valueRanges = data.valueRanges ?? []
    return ranges.map((_, i) => valueRanges[i]?.values ?? null)
  }
}

export interface ManyGridsResult {
  grids: Map<string, MonthGrids>
  failures: Map<string, Error>
}

/** Maps the fixed-order valueRanges from the formulas batchGet back onto
 * B3/B4/G4/G6. The B3:B4 range is a single 2-row valueRange; G4/G6 are each
 * a single-cell valueRange. Empty/missing cells are skipped, never written
 * as ''/undefined. */
function mapFormulas(valueRanges: ValueRange[]): Record<string, string> {
  const formulas: Record<string, string> = {}
  const b3b4 = valueRanges[0]?.values ?? []
  const g4 = valueRanges[1]?.values ?? []
  const g6 = valueRanges[2]?.values ?? []
  const cells: [string, JsonValue | undefined][] = [
    [FORMULA_KEYS[0], b3b4[0]?.[0]],
    [FORMULA_KEYS[1], b3b4[1]?.[0]],
    [FORMULA_KEYS[2], g4[0]?.[0]],
    [FORMULA_KEYS[3], g6[0]?.[0]],
  ]
  for (const [key, value] of cells) {
    if (value !== undefined && value !== null && value !== '') formulas[key] = String(value)
  }
  return formulas
}
