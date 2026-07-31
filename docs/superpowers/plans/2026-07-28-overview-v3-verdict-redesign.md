# Overview v3 — verdict-band redesign (planned 2026-07-27, execute 2026-07-28)

Reference mock: `docs/overview.html` (bundled single-file; decode the
`__bundler/template` script tag — JSON-string payload, NOT gzip — to read
the markup + demo logic). All figures below already exist in shipped libs;
this is a LAYOUT/PRESENTATION rework of `src/ui/Overview.tsx` plus small
shell/CSS/font work. No parser changes.

## Template structure (decoded 2026-07-27)

1. Header + month pills — same as current shell (Trips already gone in the
   mock's tab strip; matches shipped registry).
2. **Verdict band** (grid `1.5fr 1fr`), replaces the current 4-tile hero
   band's net-debt tile with full-width storytelling:
   - Left card, tinted red (`#1c1315`/border `#4a2a25`) when short, green
     (`#121a16`/`#264534`) when covered: kicker "Short this month" /
     "Covered this month"; 36px line "You are €X short of your dues." /
     "Dues covered, €X spare."; prose sub-line (kept X from Y income, dues
     vs holdings + expected, heaviest category callout).
   - Right card "The gap, step by step" — bridge rows: Dues still
     outstanding → − Cash and savings on hand → − Income still expected →
     **Net shortfall / Net spare** (26px, highlighted row bg `#191b20`).
   - Numbers: `toPayTotal`, `bankTotal`, `upcomingIncome().total`,
     `netDebt` — all already computed in Overview.tsx.
3. **4 hero cards with 12-mo sparklines** (grid `repeat(4,1fr)`): Money in
   (note: carryover €X excluded) · Money out (N line items) · Kept
   (green/red value; note target met / €X under target) · Net worth (note
   incl. €X invested). Each: mono 32px value, delta "±€X vs last month"
   (green/red by goodUp), 104×34 polyline sparkline + end dot.
   Maps 1:1 onto `buildKpis` cards income/expenses/saved/networth — the
   cash + upcoming cards DROP from this screen (their figures live in the
   bridge/panels now).
4. **Main grid `1fr 1.5fr 1fr`** (expenses stay center):
   - **Col 1 "Money in"**: income groups, share bars (green `#4f9d76`),
     count "N payments", single-open accordion (click → line items inset
     `#0e1013`); carryover as italic "not counted" row; FOOTER band
     "Expected later — <names>" with the upcoming-income total in green
     `#6ee7a0` (absorbs the current Upcoming income panel; names joined
     from the K/L block items).
     Then **"What you hold"**: banks with lowercase kind chips
     (current/cash/savings — derive: /sav/i → savings, name "Hand" → cash,
     else current), footer "Cash + savings" 22px.
   - **Col 2 "Where the money went"**: category rows — caret, 16px
     semibold name (NOT uppercase in this mock — drop `.cat-label`
     uppercase), "N items", 21px actual, right-aligned var label
     ("€X left" green / "€X over budget" red / "no budget" dim); share bar
     (red `#b0604f` when over budget, slate `#5a6472` otherwise);
     shareNote "NN% of spending · budget €X"; single-open accordion, line
     items in a 2-COLUMN `columns:2` inset. Footer "Total spent · N
     items" + 23px total.
     Then **"Savings, last six months"**: DIVERGING bars — center zero
     line (1px `#3d424b` at 50%), positive bars grow right (green when ≥
     target, amber `#e0b45e` under, red when negative grows left), grid
     `76px 1fr 130px 56px`, head note "target €X / month", footer "Kept
     over six months".
   - **Col 3 "Still to pay"**: header total red when netDebt>0, panel
     border red `#4a2a25`; note line "Advanzia alone accounts for NN% of
     what is left to pay." (top provider share) when short, else
     "Everything outstanding is covered by cash on hand."; provider rows =
     **card dues as providers**: total = scratch statement due, sub-note
     "€X of this already paid this month" (existing cardDues note data),
     share bar `#b0604f`, expandable items = THE CARD-CHARGED M/N/O ROWS
     for that provider (the rows 83b18b5 dropped from totals return here
     as detail-only breakdown — labels like "Advanzia Add", "Amazon
     Prime"; they still never add to any total). Non-card groups
     (Commerzbank, Other bills) keep their M/N/O figures as today. Food
     budget italic row stays.
     Then **"For context"**: 3 stat rows replacing the remaining hero
     tiles — Card payments made this month (breakdown note) · Average
     household spend (note "across N months · low €X · high €Y") · Income
     recorded all time (note "salary €X · Kindergeld €Y"). All from
     creditCardBills/lifetimeTotals.
5. Interactions: categories + income = single-open accordions (one
   `openCat`/`openInc` string), providers = independent toggles (current
   behavior); month-pill click clears all open state.

## Design language deltas

- **Archivo** joins IBM Plex Mono: Archivo for UI text (names, prose,
  verdict line), Plex Mono stays for every number/kicker. Add
  `@fontsource/archivo` weights 400/500/600/700 (800 only if the verdict
  line needs it; mock uses 700 there).
- Palette (dark): bg `#0b0c0e`, surface `#14161a`, head band `#191b20`,
  inset `#0e1013`, border `#23262b`, row hairline `#1c1f24`, text
  `#e8eaed`, dim `#6a6f77`, green `#6ee7a0`, red `#f08a7a`, amber
  `#e0b45e`, bar-green `#4f9d76`, bar-red `#b0604f`. Fold into existing
  token blocks; derive light-theme equivalents the same way the 07-26
  redesign did (mock is dark-only).
- Radius 12, panel head bands, 7–10px share bars — mostly existing
  `.panel2` language; new primitives needed: `.verdict-card`, `.bridge`,
  `.hero-spark-card`, `.diverge-bar`, `.kind-chip`, 2-col inset.
- Number format: mock uses en-US `€1,234.56` — KEEP the app's locked
  de-DE `1.234,56 €` convention (deviation, note in spec).
- The current panel tints (green/red/amber washes, commit 50f70bf) are
  SUPERSEDED by the mock's neutral surfaces + tinted verdict/dues panels
  only. Confirm with owner before deleting (Q3).

## Open questions for owner (ask before Task 1)

1. Global 6-card KPI row: on Overview the mock replaces it with the 4
   spark heroes. Hide the global row on Overview only (recommended;
   Budget/Trends/NetWorth keep it), or keep both?
2. Archivo UI font: app-wide (all screens pick it up via body font-token
   swap, recommended) or Overview-only?
3. Panel tint washes: drop everywhere per mock, or keep on the other
   screens' panels?
4. Savings diverging bars replace the current left-anchored bars — also
   sync the same style to Budget's pacing bars later? (Out of scope
   tomorrow unless owner says otherwise.)

## Tasks

1. **Tokens + fonts**: add @fontsource/archivo imports (`src/main.tsx`
   alongside plex); extend `app.css` token blocks (dark + derived light)
   with the palette deltas; `--font-ui` var, body font swap per Q2 answer.
   Test: build; visual smoke.
2. **Lib: verdict/bridge assembly** (`src/lib/overviewVerdict.ts` + tests):
   pure fn taking { toPayTotal, holdTotal, expectedTotal, saved,
   incomeTotal, duesRows, topCategory } → { tone, kicker, line, sub,
   bridge rows, duesNote }. All strings in one tested place (de-DE
   formatting), Overview.tsx just renders.
3. **Lib: hero cards** — reuse `buildKpis` (income/expenses/saved/
   networth subset) + existing Sparkline component sized 104×34; no new
   math. Gate global KpiRow per Q1 (Layout.tsx `KPI_SCREENS` minus
   overview if hidden).
4. **Col 1 rebuild**: Money in (accordion + carryover row + Expected-later
   footer absorbing the Upcoming income panel) + What you hold (kind
   chips). Kind derivation in a tiny lib fn with test.
5. **Col 2 rebuild**: Where the money went (var labels, over-budget bar
   color, 2-col inset, single-open) + Savings diverging bars
   (`.diverge-bar` CSS, target line, amber tier).
6. **Col 3 rebuild**: Still to pay (dues-as-providers with card-charged
   M/N/O rows as detail items — new pure fn `duesWithDetail(month)` in
   cardDues.ts + tests, reusing the provider substring match; Commerzbank/
   Other groups; % note) + For context panel.
7. **Assembly + cleanup**: wire Overview.tsx to the new pieces, delete the
   old hero band / dues block / tint attributes per Q3, drop dead CSS
   (`.hero-band` tiles if fully replaced, `.cat-label` uppercase, dues
   rows), registry wrapper unchanged.
8. **Verify**: typecheck/lint/full tests/build; live visual pass both
   themes vs mock (screenshot side-by-side); reviewer subagent over whole
   diff; fix round; commit + push on owner approval.

## Invariants (unchanged)

Carryover never income; card-charged upcoming rows never count toward any
total (display-only detail under their provider); dues = scratch balances
as-is; upcoming income from K/L forecast block; de-DE money everywhere;
synthetic fixtures only; parsers untouched.
