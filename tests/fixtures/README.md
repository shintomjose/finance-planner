# Fixtures

All fixtures in this directory are **fully synthetic** — fake labels and fake euro
amounts arranged at the *real* A1 coordinates documented in
`.claude/skills/finance-planner/workbook-map.md` §1. This repo is public and no real
data from the live Sambathikam workbook is ever committed here; every fixture is a
hand-built `{ "values": (string|number|null)[][], "formulas": {...} }` grid (100 rows
× 16 cols, `A1:P100`, row-major, UNFORMATTED_VALUE semantics) that a real Google
Sheets `batchGet` response would produce for a month-ledger tab.

Each of the four month-ledger fixtures covers one template era (workbook-map.md
§1.2): `JAN.json` is 2019 v1 (JAN–MAY: income/expense/summary only, carryover at
A4/B4, no bank or upcoming blocks); `AUG.json` is 2019 v2 (JUN–DEC: adds bank
balances and upcoming blocks, carryover back at A3/B3); `JAN_22.json` is the full
2020–2024 template (9-row summary, cross-sheet carryover formula, and deliberately
includes a bad-number string cell `"12,50"` and a stale `"#REF!"` scratch cell as
parser-robustness targets); and `JUN_25.json` is the 2025+ template (`Expence`
header typo, 5-row summary with a deliberately stale `Monthly AVG`, upcoming `Total`
row relocated to demonstrate it must be located by label, never hardcoded).
