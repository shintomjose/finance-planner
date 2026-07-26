# Sambathikam workbook cell-map

Authoritative reverse-engineered map of the live Google Sheet (103 tabs:
91 month ledgers + 12 special). Source: 3-agent analysis of the 2026-07-24
export. Positions marked *varies* MUST be located by label at runtime; listed
coordinates for those are test-fixture reference only.

## 1. Month-ledger tabs (91)

Names: `JAN`..`DEC` = 2019; `JAN_20`..`JUL_26` = `MMM_YY`. Period from tab name
ONLY — no dates in cells. Volume: 4,306 expense rows (avg 47/mo), 866 income rows.

### 1.1 Column blocks

| Block | Range | Rules |
| --- | --- | --- |
| Income | `A2:B40` | label/amount EUR. `Salary` at A2. `Last Month Balance` at A3 (A4 in JAN-2019) = carryover, exclude from income. |
| Expenses | `C2:D80` | flat list, label = category. D may hold inline arithmetic (`=18.99+3.99`) — UNFORMATTED_VALUE gives the number. D blank = planned/unpaid. |
| Summary | `F1:G9` | see era table below. Household cell is a hand-picked `=D19+D20+…` sum — parse its formula refs to tag household expense rows. |
| Bank balances | `I2:J~10` | account/EUR rows until I=`Total` (J at that row `=SUM`), next rows `Expected-Actual` (J7), `Balance After future Expense` (J8). Below: free-form scratch (INR banks, credit cards, debt lists) — ingest as notes only. |
| Upcoming | `M2:O~55` | name/total/to-pay until M=`Total`. Row *varies* — locate by label. |

### 1.2 Template eras

| Era | Sheets | Notes |
| --- | --- | --- |
| 2019 v1 | JAN–MAY | A/B, C/D, F/G blocks only (no bank, no upcoming) |
| 2019 v2 | JUN–DEC | +I/J bank balances (from JUN), +M/N/O upcoming (from JUL) |
| 2020–2024 | JAN_20–OCT_24 | full template; summary F1:F9 |
| Nov 2024+ | NOV_24–JUL_26 | header spelled `Expence`; summary 5 rows; K/L/P scratch areas grow |

Summary block labels:
- **2019 & 2020–24:** F1 Total Income, F2 Total Expense, F3 Balance, F4 To save,
  F5 Remain Budget, F6 Household, F7 Unexpected (2019 variants: Cycle Expense /
  Online shopping / Flight / Amazon / Train Tickets), F8 Food-Office,
  F9 Monthly AVG (from JAN_20).
- **2025+:** F1 Total Income, F2 Total Expense, F3 Balance, F4 Household,
  F5 Monthly AVG — **stale frozen formula, do not trust; recompute.**

### 1.3 Carryover chain

Label `Last Month Balance` in col A (A3; A4 in JAN-2019); **amount/formula in
col B** (B3; B4 in JAN-2019).

| Range | Formula references previous month's |
| --- | --- |
| 2019 | manual constants |
| JAN_20 | source not captured in analysis — verify at runtime; drift check covers |
| FEB_20–MAY_20 | `!J7` |
| JUN_20, AUG_20–JAN_21 | `!G3` (JUL_20 manual 3420.47) |
| FEB_21–DEC_21 | `!J8` (Balance After future Expense) |
| JAN_22–NOV_23 | `!J6` (bank Total) |
| DEC_23–MAR_25 | `!J7` (Expected-Actual) |
| APR_25–JUL_26 | `!J6` (bank Total) |

App recomputes its own chain (prev balance + income − expense) and surfaces
drift vs the sheet's value — never trusts these formulas.

### 1.4 Upcoming `Total` row positions (fixture reference only — locate by label)

NOV_20 r41; DEC_20–JAN_21 r48; APR_21–DEC_21 r50; JAN_22–MAY_22 r54; JUN_22 r81;
JUL_22–SEP_24 r77; OCT_24 r43; NOV_24–AUG_25 r52; SEP_25–JUL_26 r56.

## 2. Special tabs

### 2.1 MONTHLY_PLAN (~15 blocks)

| Block | Range | Notes |
| --- | --- | --- |
| Budget plan | `A1:D27` | income A2:A5 (total A26 = 4923), expense pairs B2:C25 (total C27 = 4005.75), surplus D2 = 917.25. **(verified live 2026-07-26)** A labeled row with a BLANK amount cell is planned-semantics — include with `plannedMonthly: null`, no issue (not excluded). |
| Lifetime income | `G1` | cross-sheet `=SUM` of every month tab's B2 |
| Commerzbank loan | `I1:J45` | **(verified live 2026-07-26)** Real layout: I2:I6 are LABELS (`AMOUNT`/`TERM`/`INTEREST`/`TOTAL`/`MONTHLY`, matched case-insensitively) with values in J2:J6 — principal/termMonths/interestEUR/totalEUR/monthlyEUR read by label match, not fixed position. Installment rows 7–44: a row counts only when I is a plain number AND J is a plain number; any string in either cell is a silent skip (no issue). J45 = paid-to-date (unchanged position). |
| Savings snapshots | `K1:N7` | |
| 2035 projection | `K11:R26` | 7.25% compound + 100000/yr contribution. **(verified live 2026-07-26)** String cells anywhere in the numeric-read positions (e.g. a header like `€ SAVINGS` at L12) are a silent skip (no bad-number issue) — numbers-only extraction is otherwise unchanged. |
| SBI Life schedule | `A29:D63` | 31 semiannual × 35721, total 430400. **(verified live 2026-07-26)** Real layout: row 29 header; A30+ is a running index (1..31, a NUMBER — never date-parsed, ignored entirely); B = date; C = amount; D unused. |
| Badminton gear € | `F30:G64` | total 1459.61. **(verified live 2026-07-26)** Real layout: F = item LABEL (no dates in this block at all); G = amountEUR. `LogEntry.fields = {label, amountEUR}`. Footer strings containing "total" + a digit stay silent. |
| Badminton gear ₹ | `L50:N62` | **(verified live 2026-07-26)** Real layout: L = item label; N = amountINR; no dates. M is an OPTIONAL numeric quantity — captured as field `qty` only when M is a plain number, otherwise ignored silently (no issue). |
| Gym log | `H48:J74` | avg 15.12 €/day. **(verified live 2026-07-26)** H=date/I=amount mapping unchanged, but footer label rows (`H73 "TOTAL"`, `H74 "AVG € PER DAY"`) are silently skipped — any string H cell matching `/total|avg/i` is treated as a footer, never a bad-date. Any OTHER unparseable H string still becomes a 'bad-date' issue. |
| Binance copy | `A65:C95` | duplicate of BINANCE tab |
| UPSTOCS | `A97:C123` | |
| Petrol log | `F81:K153` | date/litre/amount/€-per-litre/km; 62 fills, 2657.85 L, 4630.34 €, avg 1.742. **(verified live 2026-07-26)** Real layout: row 82 is the header row (`DATE`/`LITRE`/`AMOUNT`/`PER LITRE` at G82:J82, never read); F = running index (ignored entirely); G = date; H = litres; I = amountEUR (anchor); J = per-litre; K = km. Data rows 83–152. G153 `Total` footer is matched by string content and skipped silently before any date-parsing is attempted. |
| Alcohol log | `A126:C161` | **(verified live 2026-07-26)** Real layout: row 126 is the header (B `Item`, C `Amount`, skipped — data starts row 127); A = index (ignored entirely); B = label; C = amountEUR; no dates. Row inclusion keyed off B (the label cell). |

### 2.2 MUTUAL FUNDS

Rows 1–37 data + summary `M39:N42` (invested 754,000 ₹, current 708,699, −6.01%).
**(verified live 2026-07-26)** Row 38 is a per-fund TOTAL row (`B38 "TOTAL"`,
summed amounts in every group's value column), NOT a 37th scaffold/data row —
it must be excluded from the per-group data loop (bound is now 2–37).
Funds as column groups: Quant A–D (SIP 2000/mo), JM Flexi E–G (5000/mo),
PGIM H–J (3000/mo), 360 One K/L, SBI PSU/Quant M/N (sold), Aditya Birla O/P
(lump 100000), SBI PSU Q/R (sold), HDFC Small Cap S/T, Motilal Midcap U/V,
Invesco Midcap W/X (lump 215000). SIP groups: date/amount + current-val col;
lump groups: date/value snapshots. **Pre-numbered empty scaffold rows are not
data.**

### 2.3 DEUTSCHE BANK

- Products `A2:C10`, 607.39 €/mo total: RiesterRente Shinto 160.42, BasisRente
  27, RiesterRente Sandra 10, Badenia Bausparen 210, DWS Fonds 199.97.
- Payment matrix `E2:N91`. **(verified live 2026-07-26)** Row 2 is a HEADER
  row (not a payment row — real headers: `E "No"`, `F "Date"`, `G` blank,
  `H "Equities Invested"`, `I "Equities Total"`, `J "Profit"`,
  `K "RiesterRente - Shinto"`, `L "Resiterrente - Sandra"` [sic typo,
  tolerated], `M "BasisRente - Shinto"`, `N` a further product header).
  Data rows are 3–90 (not 2–90). Product columns are discovered DYNAMICALLY
  by fuzzy header match against the 5 known products (tolerating the
  "Resiterrente" typo) — an unmatched header column (e.g. `H`/`J` above) is
  still parsed, using its raw header text as the product name, rather than
  being dropped. E = index (ignored), F = date. G91 grand total 41,070 €,
  per-mapped-column sums row 91 (the 4 previously-reported sum-drifts were
  column misassignment — they vanish once compared against the correctly
  mapped column), sporadic valuations col I (unchanged design, latest
  15,143.17).

### 2.4 BINANCE

**(verified live 2026-07-26)** Header row 2, data rows 3–24. A = running
index — ignored entirely, never date-parsed (previously misread as the date
column). B = date, C = combined deposit/withdraw amount, D = running total,
F = current spot, G = P/L. Final: net 1,462.76 € deposited, current value
362 €. (MONTHLY_PLAN A65:C95 is a copy — parse the BINANCE tab as source of
truth.)

### 2.5 SACHIN (brother ledger)

- Given: `B2:C336` (dates appear in col A from ~row 122; last entry 2026-07-24);
  total G131 = 31,135.64 €.
- Repayments: `F133:G189` = 29,650 €. **(verified live 2026-07-26)** Real
  layout: F = LABEL (no dates in this block at all — `date` is always null);
  G = amountEUR.
- Remaining: G132 — cross-references `INDIA_2023!I19`. **(verified live
  2026-07-26)** This parser no longer recomputes `remaining` as given−repaid
  and drift-checks it against G132 — the cross-sheet reference makes a naive
  recompute produce a large false "drift". G132 is now read and trusted
  as-is (no sum-drift issue ever emitted for it); the given-total (G131) and
  a repayments-total drift check (inferred footer at G190, unverified
  against the real sheet — no explicit cell was given in the live-run brief)
  remain.
- EMI trackers: iPhone-13 `H3:J24`, iPhone 14 `H27:J40`, Fridge `H43:J53`,
  Washing Machine `H57:H63`.

### 2.6 INDIA_2023 (4 stacked trips — locate headers by text, rows *vary*)

| Trip | Header cells (fixture ref) | Totals |
| --- | --- | --- |
| Dec 2023 | B1 | ₹539,791.25 |
| Apr 2024 | E33 / I33 | ₹128,941.43 |
| Jul 2024 | E114 / I114 | ₹329,998.82 + ICICI col K 198,604.26 |
| Feb 2025 | E252 / I252 | ₹71,958.56 |

Each trip: ₹ in-India ledger + € pre-travel ledger + ICICI credit-card split
column. New block appended per trip → parser scans for headers dynamically.

### 2.7 Dead tabs — SKIP

BAPTISM, OTTO, INDIA SEP 19, ETC-OLD, most of ETC (ETC holds closed
loans/installments; only its Sandra-Federal-Bank block possibly relevant later).

## 3. Recurring formula idioms

- Inline arithmetic as itemized receipts: `=18.99+3.99`.
- FX: `=ROUND(₹/rate,2)` with hardcoded drifting rates (78 → 100 ₹/€ over time).
- Text-concat subtotals: `… & " Total €: " & TEXT(SUM(...),"0.00")` → string cell.
- Stale `#REF!` in old scratch areas → null + Parser Health.
- Mixed date encodings incl. day/month-swap locale artifacts.

## 4. Labels — category-map seed (label: frequency)

- **Groceries:** Edeka 165, Kaufland 139, Lidl 130, Indian Store 86, DM/dm 43,
  rewe/Rewe 29+, Netto 25, Aldi talk 29.
- **Fixed/recurring:** Rent 91, DISABILITY 96, SHORT TERM 72, LIABILITY & UNFALL
  INS 68, Vodafone 67, o2 65, EnBW/Enbw 63, Gym 43, Radio 35, Amazon Bill 34,
  CommerzBank emi 33, Reccurring(Fed 9000) 33, Reccurring(SC 10000) 32,
  Car-320 24, SBI Life(36596) 24, Telekom 23, ICICI BILL 22, Amazon CC 21,
  iPhone 19, Mutual Funds & India 17.
- **Family:** Sachin 37 (+Revolut 31, +N26 24), Sandra Savings India(2400) 26,
  Sandra Phone 25, Sandra pocket money(25) 24, To India 19.
- **Lifestyle:** Church 114, Parking 56, Petrol 46, Lotto 42+36, Apotheke 38,
  Medical Store 36, Doner 34 + Lunch-Doner 29, Cake 30, Burger King 23,
  Car Service 20, Food Home 20, Yufka 19, Cig 18, Post 16.
- **Income:** Revolut Add 163, Salary 91, Last Month Balance 91 (carryover —
  exclude), Sachin 67, Revolut 64, KinderGeld 28, Achachan 25, Pfand 23, KG 18,
  Anu 14, Monu 11, Sandra/ElternGeld 10, Uncle/EG 9, Binance 7.
