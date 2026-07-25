// Shared A1-notation cell-reading helpers for special-tab parsers (extracted
// from monthlyPlan.ts when mutualFunds.ts needed the same shape — see Plan 2
// Task 4 report). Every special-tab parser has its own single-tab `SHEET`
// constant, so the read* functions here take `sheet` as an explicit
// parameter rather than closing over one; callers typically define a
// thin local wrapper binding their own SHEET constant, e.g.:
//   function readNumber(values, ref, issues) { return readNumberAt(values, ref, SHEET, issues) }
import type { ParserIssue } from '../types'

/** A1 column letters ('A', 'B', ..., 'Z', 'AA', ...) → 0-based index. */
export function colToIndex(col: string): number {
  let idx = 0
  for (let i = 0; i < col.length; i++) idx = idx * 26 + (col.charCodeAt(i) - 64)
  return idx - 1
}

/** A1-notation cell ref (e.g. 'D19') → 0-based { row, col } grid indices. */
export function parseA1(ref: string): { row: number; col: number } {
  const m = /^([A-Z]+)(\d+)$/.exec(ref)
  if (!m) return { row: -1, col: -1 }
  return { row: Number(m[2]) - 1, col: colToIndex(m[1]) }
}

/** Reads a single cell by A1 ref from the values grid; missing/OOB → null. */
export function cellAt(values: (string | number | null)[][], ref: string): string | number | null {
  const { row, col } = parseA1(ref)
  if (row < 0 || col < 0) return null
  const line = values[row]
  if (!line) return null
  const v = line[col]
  return v === undefined ? null : v
}

// Type predicate (not just boolean) so downstream string-only calls (e.g.
// parseDelimitedDate) narrow correctly after an `if (isBlank(raw)) return`.
export const isBlank = (v: string | number | null): v is null | '' => v === null || v === ''

/** Sheets error strings all start with '#' (#REF!, #N/A, #DIV/0!, ...). */
export const isErrorString = (v: unknown): v is string => typeof v === 'string' && v.startsWith('#')

/**
 * Reads a cell expected to hold a plain number. Blank → null quietly.
 * '#REF!'/error string → null + 'ref-error'. Any other non-numeric string →
 * null + 'bad-number'.
 */
export function readNumberAt(
  values: (string | number | null)[][], ref: string, sheet: string, issues: ParserIssue[]
): number | null {
  const raw = cellAt(values, ref)
  if (isBlank(raw)) return null
  if (typeof raw === 'number') return raw
  if (isErrorString(raw)) {
    issues.push({ sheet, cell: ref, kind: 'ref-error', detail: `error value "${raw}" at ${ref}`, raw })
    return null
  }
  issues.push({ sheet, cell: ref, kind: 'bad-number', detail: `non-numeric value "${raw}" at ${ref}`, raw })
  return null
}

// Sheets/Excel serial date epoch: serial 25569 == 1970-01-01 (UNFORMATTED_VALUE
// + SERIAL_NUMBER date rendering, see api/sheets.ts).
const SHEET_EPOCH_SERIAL = 25569
const MS_PER_DAY = 86400000

export function serialToISODate(serial: number): string | null {
  const ms = (serial - SHEET_EPOCH_SERIAL) * MS_PER_DAY
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

// Accepts 'DD-MM-YYYY' and 'DD.MM.YYYY' (workbook-map.md §3 mixed date encodings).
const DELIMITED_DATE_RE = /^(\d{1,2})[.-](\d{1,2})[.-](\d{4})$/

export function parseDelimitedDate(raw: string): string | null {
  const m = DELIMITED_DATE_RE.exec(raw.trim())
  if (!m) return null
  const day = Number(m[1])
  const month = Number(m[2])
  const year = Number(m[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${year}-${pad(month)}-${pad(day)}`
}

/**
 * Reads a cell expected to hold a date. Blank → null quietly. Numeric →
 * serial-date conversion. '#REF!' → null + 'ref-error'. Any other
 * non-blank unparseable value → null + 'bad-date'.
 */
export function readDateAt(
  values: (string | number | null)[][], ref: string, sheet: string, issues: ParserIssue[]
): string | null {
  const raw = cellAt(values, ref)
  if (isBlank(raw)) return null
  if (typeof raw === 'number') {
    const iso = serialToISODate(raw)
    if (iso === null) {
      issues.push({ sheet, cell: ref, kind: 'bad-date', detail: `unparseable serial date ${raw} at ${ref}`, raw })
    }
    return iso
  }
  if (isErrorString(raw)) {
    issues.push({ sheet, cell: ref, kind: 'ref-error', detail: `error value "${raw}" at ${ref}`, raw })
    return null
  }
  const iso = parseDelimitedDate(raw)
  if (iso === null) {
    issues.push({ sheet, cell: ref, kind: 'bad-date', detail: `unparseable date "${raw}" at ${ref}`, raw })
  }
  return iso
}
