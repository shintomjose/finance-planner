# Overview v2 + Badminton — implementation plan (2026-07-27)

Spec: `docs/superpowers/specs/2026-07-27-overview-v2-badminton-design.md`.
Direct implementation (single controller), whole-diff review before commit.

## Global constraints

- Golden rules hold: carryover never income; recomputed averages never sheet
  AVG cells; read-only scope; synthetic fixtures only.
- Scratch capture is label-located (no fixed rows) and silently skips
  non-numeric cells (documented spec exception).
- All new figure logic lives in pure libs with vitest coverage; screens only
  render lib output.

## Tasks

1. **types + parser**: `ScratchEntry`, `MonthData.scratch?`; `parseScratch`
   in month.ts (IJ below bank Total excluding Expected-Actual/Balance-after;
   KL rows 2..60); extend JUN_25 fixture with scratch rows; tests in
   month-banks-upcoming.test.ts.
2. **normalize**: ALIASES + `'advancia cc'/'advanzia cc' → 'advanzia'`,
   `'amex cc' → 'amex'`; normalize + creditCardBills test updates.
3. **cardDues lib + tests**: 4 rows per spec §3; null-safe notes; round2.
4. **lifetimeTotals lib + tests**: spec §4; fxRate default 100→92 in
   appState (test update).
5. **kpis**: drop savings card, rename saved/cash labels; test updates.
6. **registry/screens**: ScreenId + `badminton`; SCREEN_ORDER swap
   trips→badminton; Badminton.tsx (gear € BarMeter list + ₹ table, fxRate
   equiv); Overview lazy wrapper passes `sachin`.
7. **Overview.tsx**: hero band; column swap; dues block + card-row filter +
   coverage/total rework; uppercase categories; savings label `Jul '26`;
   style fixes.
8. **CSS**: hero band, dg column dividers, Items/Share spacing, savings
   cols.
9. **Verify**: typecheck, lint, full tests, build; visual pass (both
   themes, live data); reviewer subagent over whole diff; fix round if
   needed.
