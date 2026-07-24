# Session Handover — Sambathikam Finance Planner

Date: 2026-07-24. Origin session ran in `chavara-badminton` repo (analysis phase).
This file lets a fresh Claude session in THIS repo (`finance-planner`) continue
seamlessly. Read this + the design spec before doing anything.

## 1. What this project is

Personal finance planning + budget management web app for Shinto, hosted on
GitHub Pages from this repo, reading his long-lived Google Sheet
("Sambathikam", used since 2019) live via Google Sheets API. Data entry stays
in Google Sheets forever; the app is a read-only dashboard/planner/analytics
layer. No financial data ever enters this repo.

Reference workbook: `C:\Users\shintappan\Desktop\PROJECTS\chavara-badminton\docs\Sambathikam.xlsx`
(export of the live sheet; 5.8 MB, 103 tabs). NEVER commit it here.

## 2. Current state

- [x] Workbook fully reverse-engineered (3 parallel analysis agents ran; findings
      merged into the design spec §3 and Appendix A below).
- [x] Architecture decided by user via explicit choice (see §3).
- [x] Design spec written and self-reviewed:
      `docs/superpowers/specs/2026-07-24-sambathikam-planner-design.md`
- [x] User spec review — APPROVED 2026-07-24.
- [x] Repo visibility — user chose PUBLIC. NOT yet flipped: `gh` unauthenticated;
      user must run `gh auth login` then
      `gh repo edit shintomjose/finance-planner --visibility public --accept-visibility-change-consequences`
      (or GitHub web settings).
- [x] Claude skill `finance-planner` created + retrieval-tested (12/12):
      `.claude/skills/finance-planner/SKILL.md` + `workbook-map.md`.
- [x] Claude agent `finance-dev` created (`.claude/agents/finance-dev.md`).
- [x] Implementation Plan 1 (foundation) written:
      `docs/superpowers/plans/2026-07-24-plan1-foundation.md`. Plan 2 (special
      sheets + full UI) deliberately deferred until Plan 1 executes.
- [x] Plan 1 EXECUTED (2026-07-24, subagent-driven): 16 commits, 66/66 tests,
      all task reviews + final whole-branch review clean. Merged to main, pushed.
- [ ] User: GCP setup (README "Setup"), fill src/config.ts, repo → public,
      Pages source → GitHub Actions, first deploy + real-sheet run.
- [ ] Plan 2: special-sheet parsers + full UI modules (spec §5). Backlog from
      reviews in .superpowers/sdd/progress.md (union ParserIssue.kind, silent
      re-auth, cachedBanner precision, CI concurrency, tests typecheck, etc.).
- Repo is empty: no initial commit, no branch yet. Nothing committed — user
  rule: NEVER commit without explicit approval.

## 3. Locked decisions (user chose these explicitly — do not relitigate)

1. **Architecture: Option C** — live Google Sheets dashboard. Rejected: A′
   (GitHub-as-backend, two repos, PAT) and B (browser-only storage).
2. **Data entry stays in Google Sheets.** App never becomes the entry point.
3. **Full scope**: month ledgers + MONTHLY_PLAN budget + investments
   (Deutsche Bank, Mutual Funds, Binance, UPSTOCS) + SACHIN ledger + India
   trips + logs (petrol, gym, badminton gear).
4. **No client-side encryption** (data stays in Google anyway).
5. OAuth scope `spreadsheets.readonly`; GCP project in Testing mode with owner
   as only test user (personal-use exception → no Google verification review).

## 4. Stack (from spec §4)

React + Vite + TypeScript SPA. Google Identity Services token flow.
Sheets API v4 `values.batchGet` with UNFORMATTED_VALUE. IndexedDB cache
(historical month tabs immutable → cache forever; live set = current month,
MONTHLY_PLAN, SACHIN, MUTUAL FUNDS, DEUTSCHE BANK, INDIA trips). App-owned
state (category map, goals, recurring confirmations, FX rate) in
localStorage + JSON export/import. GitHub Actions CI → Pages deploy.
Charts lib decided in implementation plan (recharts or uPlot).

## 5. Next steps, in order

1. User reviews/approves design spec (may request changes).
2. Get repo-visibility decision (public vs Pro).
3. Write `.claude/skills/finance-planner/SKILL.md` — encode: full workbook
   cell-map (spec §3 + Appendix A), parser rules, category normalization map,
   app conventions, Sheets API + GIS patterns, synthetic-fixture policy.
4. Write `.claude/agents/finance-dev.md` — project agent; must always load the
   `finance-planner` skill; UI work follows the skill's design conventions.
5. Invoke `superpowers:writing-plans` → implementation plan in
   `docs/superpowers/plans/`.
6. Execute plan (superpowers:executing-plans / subagent-driven-development).
   TDD for parsers (fixtures = SYNTHETIC data mirroring real coordinates).
7. GCP setup (user does in browser, guide them): create project, enable Sheets
   API, OAuth consent screen (Testing mode, add own Gmail as test user),
   create OAuth Web client ID with Pages URL + http://localhost:5173 as
   authorized JS origins.

## 6. Standing user rules (carry over from origin session)

- NEVER commit until user explicitly approves. "Commit message" request =
  text only. Suggest one-line message when a feature is done.
- Commit format: one line, `<type>(<scope>): <subject>` style (origin project
  used `CB` prefix; for this repo propose `FP` prefix, confirm with user).
- User communicates tersely; keep responses compact, substance-first.

## 7. Key risks / gotchas

- Parser drift: user keeps hand-editing the sheet. Parser Health screen is a
  first-class module (spec §5.9) — unparsed cells must surface there, never
  silently drop.
- 1-hour OAuth tokens → silent re-prompt; cached data keeps UI alive.
- Month tab names encode the period (`JAN`=2019, `MMM_YY` after); no dates in
  ledger cells at all.
- Pre-numbered empty scaffold rows in several sheets must not count as data.
- Mixed date formats + day/month-swap artifacts in special sheets.
- Text-concat subtotal cells are strings, not numbers.
- Stale `#REF!` cells exist; treat as null, log to Parser Health.

---

## Appendix A — workbook details beyond the spec

(Extra reverse-engineering detail not fully in the spec; source: analysis agents.)

### A.1 Month-sheet template eras

| Era | Sheets | Notes |
| --- | --- | --- |
| 2019 v1 | JAN–MAY | A/B, C/D, F/G blocks only |
| 2019 v2 | JUN–DEC | +I/J Bank Balances (JUN), +M/N/O Upcoming (JUL) |
| 2020–2024 | JAN_20–OCT_24 | full template; F block rows F1–F9 |
| Nov 2024+ | NOV_24–JUL_26 | header `Expence`; F block 5 rows (Household=G4, Monthly AVG=G5); K/L/P scratch areas grow |

Summary block labels by era:
- 2019/2020–24: F1 Total Income, F2 Total Expense, F3 Balance, F4 To save,
  F5 Remain Budget, F6 Household, F7 Unexpected (2019 variants: Cycle
  Expense/Online shopping/Flight/Amazon/Train Tickets), F8 Food-Office,
  F9 Monthly AVG (from JAN_20).
- 2025+: F1 Total Income, F2 Total Expense, F3 Balance, F4 Household,
  F5 Monthly AVG (stale frozen formula — do not trust; recompute).

### A.2 Carryover chain (`Last Month Balance`, cell B3; B4 in JAN-2019)

| Range | References previous month's |
| --- | --- |
| 2019 | manual constants |
| FEB_20–MAY_20 | `!J7` |
| JUN_20, AUG_20–JAN_21 | `!G3` (JUL_20 manual 3420.47) |
| FEB_21–DEC_21 | `!J8` (Balance After future Expense) |
| JAN_22–NOV_23 | `!J6` (bank Total) |
| DEC_23–MAR_25 | `!J7` (Expected-Actual) |
| APR_25–JUL_26 | `!J6` (bank Total) |

App recomputes its own carryover chain and shows drift vs sheet values.

### A.3 Upcoming-expenses totals row (locate by M=`Total`, never hardcode)

Known positions: NOV_20 r41; DEC_20–JAN_21 r48; APR_21–DEC_21 r50;
JAN_22–MAY_22 r54; JUN_22 r81; JUL_22–SEP_24 r77; OCT_24 r43;
NOV_24–AUG_25 r52; SEP_25–JUL_26 r56.

### A.4 Top labels with frequencies (for category-map seed)

- Groceries: Edeka 165, Kaufland 139, Lidl 130, Indian Store 86, DM/dm 43,
  rewe/Rewe 29+, Netto 25, Aldi talk 29.
- Fixed/recurring: Rent 91, DISABILITY 96, SHORT TERM 72, LIABILITY & UNFALL
  INS 68, Vodafone 67, o2 65, EnBW/Enbw 63, Gym 43, Radio 35, Amazon Bill 34,
  CommerzBank emi 33, Reccurring(Fed 9000) 33, Reccurring(SC 10000) 32,
  Car-320 24, SBI Life(36596) 24, Telekom 23, ICICI BILL 22, Amazon CC 21,
  iPhone 19, Mutual Funds & India 17.
- Family: Sachin 37 (+Revolut 31, +N26 24), Sandra Savings India(2400) 26,
  Sandra Phone 25, Sandra pocket money(25) 24, To India 19.
- Lifestyle: Church 114, Parking 56, Petrol 46, Lotto 42+36, Apotheke 38,
  Medical Store 36, Doner 34 + Lunch-Doner 29, Cake 30, Burger King 23,
  Car Service 20, Food Home 20, Yufka 19, Cig 18, Post 16.
- Income labels: Revolut Add 163, Salary 91, Last Month Balance 91 (carryover,
  exclude), Sachin 67, Revolut 64, KinderGeld 28, Achachan 25, Pfand 23,
  KG 18, Anu 14, Monu 11, Sandra/ElternGeld 10, Uncle/EG 9, Binance 7.

### A.5 Special-sheet block coordinates (condensed)

- **MONTHLY_PLAN**: budget plan A1:D27 (A26 income total 4923, C27 expense
  total 4005.75, D2 surplus 917.25); lifetime income G1 (sums B2 of every
  month tab); Commerzbank loan I1:J45 (20000, 36×631.31, J45 paid 19600.7);
  savings snapshots K1:N7; 2035 projection K11:R26 (7.25% compound +100000/yr);
  SBI Life schedule A29:D63 (31 semiannual × 35721, total 430400); badminton
  gear € F30:G64 (1459.61) + ₹ L50:N62; gym log H48:J74 (avg 15.12 €/day);
  Binance copy A65:C95; UPSTOCS A97:C123; petrol log F81:K153 (62 fills,
  2657.85 L, 4630.34 €, avg 1.742); alcohol log A126:C161.
- **MUTUAL FUNDS**: rows 1–38 + summary M39:N42. Funds (cols): Quant A–D (SIP
  2000/mo), JM Flexi E–G (5000/mo), PGIM H–J (3000/mo), 360 One K/L, SBI
  PSU/Quant M/N (sold), Aditya Birla O/P (100000), SBI PSU Q/R (sold), HDFC
  Small Cap S/T, Motilal Midcap U/V, Invesco Midcap W/X (215000). Invested
  754000 ₹, current 708699, −6.01%.
- **DEUTSCHE BANK**: products A2:C10 (607.42/mo: RiesterRente Shinto 160.42,
  BasisRente 27, RiesterRente Sandra 10, Badenia Bausparen 210, DWS Fonds
  199.97); payment matrix E2:N91, payments #1–68 (2020-07→2026-01), G91 total
  41070, valuations col I (latest 15143.17), per-product sums row 91.
- **BINANCE**: header row 2, rows 3–24; running total D, spot F, P/L G;
  final: 1462.76 net in, 362 value.
- **SACHIN**: ledger B2:C336 (dates in A from ~row 122; last entry 2026-07-24);
  total G131=31135.64; repayments F133:G189=29650; remain G132 (uses
  INDIA_2023!I19). EMIs: iPhone-13 H3:J24, iPhone 14 H27:J40, Fridge H43:J53,
  Washing Machine H57:H63.
- **INDIA_2023**: 4 stacked trips, headers at B1 (Dec 2023, total ₹539791.25),
  E33/I33 (Apr 2024, ₹128941.43), E114/I114 (Jul 2024, ₹329998.82 + ICICI col
  K 198604.26), E252/I252 (Feb 2025, ₹71958.56). Each: ₹ ledger + € pre-travel
  ledger + ICICI split. Locate trips by header text, not fixed rows.
- Dead tabs (skip): BAPTISM, OTTO, INDIA SEP 19, ETC-OLD, most of ETC
  (ETC has closed loans/installments; only Sandra-Federal-Bank block maybe
  relevant).

### A.6 Architecture research nuggets (option context, if revisited)

- GitHub Pages free = public repo AND public site; private-repo Pages needs
  Pro; login-gated Pages = Enterprise only.
- api.github.com supports CORS; fine-grained single-repo PAT enables the
  rejected A′ design — fallback if user ever wants in-app data entry.
- Google sensitive-scope personal-use exception: keep GCP project in Testing
  mode, self as test user; 1-h tokens, consent popup per session.
