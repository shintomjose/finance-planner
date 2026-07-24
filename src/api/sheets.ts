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

type JsonValue = string | number | null

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
    fetchFn: typeof fetch = fetch,
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
      if (!res.ok) throw new Error(`Sheets API error ${res.status}: ${url}`)
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

  /** Two batchGet calls: (1) the full grid, UNFORMATTED_VALUE + SERIAL_NUMBER
   * dates; (2) the four formula cells the parser needs (household refs +
   * carryover-adjacent cells), FORMULA render. Ragged/short API rows are
   * passed through as-is — parseMonth's cell() already treats missing
   * cells/rows as null (verified in T5), so no padding here. */
  async fetchMonthGrids(tab: string): Promise<MonthGrids> {
    const quoted = `'${tab}'`

    const valuesUrl =
      `${this.base}/values:batchGet?ranges=${encodeURIComponent(`${quoted}!A1:P100`)}` +
      `&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`
    const valuesData = (await this.request(valuesUrl, tab)) as BatchGetResponse
    const values = (valuesData.valueRanges?.[0]?.values ?? []) as MonthGrids['values']

    const formulaRanges = [`${quoted}!B3:B4`, `${quoted}!G4`, `${quoted}!G6`]
    const formulaRangesQuery = formulaRanges.map((r) => `ranges=${encodeURIComponent(r)}`).join('&')
    const formulasUrl = `${this.base}/values:batchGet?${formulaRangesQuery}&valueRenderOption=FORMULA`
    const formulasData = (await this.request(formulasUrl, tab)) as BatchGetResponse
    const formulas = mapFormulas(formulasData.valueRanges ?? [])

    return { values, formulas }
  }
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
