---
name: finance-planner
description: Use when doing ANY work in the finance-planner repo — parsing the Sambathikam Google Sheet workbook, month-ledger or special-sheet parsers, Google Sheets API v4 / Google Identity Services auth, IndexedDB caching, UI modules, test fixtures, or planning changes. Also use when questions mention Sambathikam, month tabs, MONTHLY_PLAN, SACHIN, MUTUAL FUNDS, DEUTSCHE BANK, BINANCE, INDIA_2023, carryover, or Parser Health.
---

# Finance Planner (Sambathikam)

## Overview

Personal finance dashboard for one user (Shinto). Static React + Vite + TypeScript
SPA on GitHub Pages, reading his live Google Sheet **"Sambathikam"** (used since
2019, 103 tabs) via Sheets API v4, scope `spreadsheets.readonly`. Data entry stays
in Google Sheets forever; the app is a read-only dashboard/planner/analytics layer.

**Design spec (authoritative):** `docs/superpowers/specs/2026-07-24-sambathikam-planner-design.md`
**Full workbook cell-map (load before writing any parser):** [workbook-map.md](workbook-map.md)

## Golden rules

1. **No real financial data ever enters this repo.** Reference workbook lives
   outside the repo (`..\chavara-badminton\docs\Sambathikam.xlsx`) — NEVER commit
   or copy it here. Test fixtures are SYNTHETIC (see Fixture policy).
2. **Read-only forever.** OAuth scope `spreadsheets.readonly`. The app never
   writes to the sheet.
3. **NEVER git commit without the user's explicit approval.** "Commit message"
   request = text only. When a feature is done, suggest a one-line message:
   `<type>(<scope>): <subject>` (propose `FP` scope prefix).
4. **Parsers never crash and never silently drop.** Every unparsed/unexpected
   cell routes to the Parser Health module (spec §5.9) as a structured issue.
5. User communicates tersely; respond compact, substance-first.

## Architecture quick reference

| Concern | Choice |
| --- | --- |
| Auth | Google Identity Services **token flow** (implicit, no backend). GCP project stays in Testing mode, owner = only test user → no verification review. 1-h tokens: silent re-prompt; cached data keeps UI alive. |
| Fetch | Sheets API v4 `spreadsheets.values.batchGet`, `valueRenderOption=UNFORMATTED_VALUE`. For carryover/household tagging, use `spreadsheets.get` with `fields=...userEnteredValue` on targeted ranges to read formulas. |
| Cache | IndexedDB. Historical month tabs = immutable → fetch once, cache forever. Live set = current month, MONTHLY_PLAN, SACHIN, MUTUAL FUNDS, DEUTSCHE BANK, BINANCE, INDIA_2023 → refresh on demand / staleness TTL. |
| App-owned state | category mapping, goals, recurring confirmations, FX ₹/€ override → localStorage + JSON export/import. Never in the sheet. |
| Config | `config.ts` holds spreadsheet ID + OAuth client ID — both safe in a public repo (client ID public by design; spreadsheet ID alone grants nothing under readonly OAuth). |
| Charts | lightweight lib (recharts or uPlot — per implementation plan). |
| Deploy | GitHub Actions: typecheck → test → build → Pages. |

Domain model (spec §4): `Transaction`, `MonthSummary`, `Budget`,
`InvestmentSnapshot`, `PersonLedger`, `Trip`, `LogEntry`.

## Parser rules (apply to every parser)

- **Period comes from tab name only** — no dates in month-ledger cells.
  `JAN`..`DEC` = 2019; otherwise `MMM_YY`.
- **Locate blocks by label, never hardcode rows** where the map says position
  varies (Upcoming `Total` row, bank `Total` row, INDIA_2023 trip headers).
- **Pre-numbered empty scaffold rows** (e.g. MUTUAL FUNDS) are not data — a row
  needs a real value beyond its running number to count.
- **`#REF!` / error cells** → null + Parser Health entry.
- **Text-concat subtotal cells** (`… & " Total €: " & TEXT(...)`) are strings —
  parse the number out or ignore per map; never coerce blindly.
- **Inline arithmetic** (`=18.99+3.99`) — UNFORMATTED_VALUE returns the computed
  number; the formula text (itemized receipt) is optional enrichment.
- **Mixed date encodings** in special sheets: real datetimes, `DD-MM-YYYY`,
  `DD.MM.YYYY`, month names, day/month-swap artifacts. Parse defensively;
  ambiguous → Parser Health.
- **`Last Month Balance` is carryover, not income.** Exclude from income totals.
  App recomputes its own carryover chain and reports drift vs sheet values.
- **Category normalization is case-insensitive** (`Enbw`=`EnBW`, `rewe`=`Rewe`)
  and then runs through the user-editable category map (seed list in
  workbook-map.md §Labels).
- Blank expense amount (D empty) = planned/unpaid → flag `planned`, not zero.

## Sheets API + GIS pattern

```ts
// GIS token flow (no gapi client needed)
const tokenClient = google.accounts.oauth2.initTokenClient({
  client_id: CONFIG.clientId,
  scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
  callback: (resp) => onToken(resp.access_token), // expires_in ~3600
});
tokenClient.requestAccessToken({ prompt: '' }); // '' = silent if consented

// Batch fetch
const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.sheetId}/values:batchGet`);
for (const r of ranges) url.searchParams.append('ranges', r); // e.g. "JAN_22!A2:B40"
url.searchParams.set('valueRenderOption', 'UNFORMATTED_VALUE');
url.searchParams.set('dateTimeRenderOption', 'SERIAL_NUMBER');
const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
if (res.status === 401) reauth(); // token expired
```

Tab names with spaces must be quoted in ranges: `'MUTUAL FUNDS'!A1:X42`.

## Fixture policy (tests)

Repo is public → fixtures are **synthetic**: identical coordinates/shape per era,
fake labels and amounts. Era coverage minimum: `JAN` (2019 v1), `AUG` (2019 v2),
`JAN_22` (2020–24), `JUN_25` (2025+), plus one fixture per special-sheet block.
TDD for all parsers (superpowers:test-driven-development).

## UI module build order (spec §5)

1 Overview · 2 Budget vs Actual · 3 Trends · 4 Net worth/Investments ·
5 Sachin · 6 Trips · 7 Logs · 8 Goals & Recurring · 9 Parser Health.
Mobile-first responsive, dark/light.

## Common mistakes

| Mistake | Fix |
| --- | --- |
| Hardcoding Upcoming/bank `Total` row numbers | Scan for the `Total` label (positions listed in workbook-map.md are for tests only) |
| Counting `Last Month Balance` as income | It's carryover — separate field |
| Trusting F-block `Monthly AVG` in 2025+ tabs | Stale frozen formula — recompute |
| Counting scaffold rows as fund entries | Require a real data value |
| Committing real workbook data / xlsx | Forbidden — synthetic fixtures only |
| Committing without user approval | Never — suggest message, wait |