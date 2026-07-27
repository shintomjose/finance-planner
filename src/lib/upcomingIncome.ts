// Overview "Upcoming income" panel (owner request 2026-07-27): expected
// inflows for the month — Salary, Kindergeld (KG/EG), money people owe him
// (Sachin, Cris, ...) — as curated by the owner in the K/L forecast block
// of each month tab (owner picked this block explicitly as the source).
//
// Live JUL_26 shape of that block (labels, not fixed rows):
//   K15 BALANCE REDACTED        <- start anchor candidates
//   K16 MINUS EXP -REDACTED    <-
//   K17 KG+EG (blank)
//   K18 SACHIN 900.60          <- the income rows live HERE
//   K19 CRIS (blank)
//   K21 Salary (blank)
//   K22 TOTAL -REDACTED        <- end anchor
//
// The income rows are exactly the labeled K/L rows BETWEEN the last of
// BALANCE/MINUS EXP and the first TOTAL after it. Rows with a blank L cell
// mean "nothing expected from this source right now" — MonthData.scratch
// only captures numeric values, so they simply don't appear. The sheet's
// own TOTAL is a forecast figure (income minus remaining expenses), NOT the
// income total, so this lib sums the income rows itself.
import { round2 } from './mathUtils'
import type { MonthData } from '../types'

export interface UpcomingIncomeItem { label: string; amountEUR: number }

export interface UpcomingIncome {
  items: UpcomingIncomeItem[]
  total: number
}

const END_LABEL = 'total'

/**
 * Extracts the owner's expected-income rows from the K/L forecast block.
 * Returns null when the month has no recognizable block (no BALANCE/MINUS
 * EXP anchor followed by a TOTAL) — pre-forecast-era tabs — so the panel
 * can distinguish "block absent" from "block present but empty".
 *
 * Anchor = the FIRST "MINUS EXP" row, falling back to the FIRST "BALANCE"
 * row. Never a max/last scan: the K/L scratch on the live JUL_26 holds a
 * SECOND, unrelated "BALANCE" row further down (the FED/Fed-NRE INR
 * sub-block at K43) that would hijack the range (live-run bug,
 * 2026-07-27).
 */
export function upcomingIncome(month: MonthData): UpcomingIncome | null {
  const kl = (month.scratch ?? []).filter((s) => s.block === 'KL').sort((a, b) => a.row - b.row)
  if (kl.length === 0) return null

  const anchor = kl.find((s) => s.normLabel === 'minus exp') ?? kl.find((s) => s.normLabel === 'balance')
  if (!anchor) return null
  const startRow = anchor.row
  const end = kl.find((s) => s.normLabel === END_LABEL && s.row > startRow)
  if (!end) return null

  const items = kl
    .filter((s) => s.row > startRow && s.row < end.row)
    .map((s) => ({ label: s.label, amountEUR: s.amountEUR }))

  return { items, total: round2(items.reduce((sum, i) => sum + i.amountEUR, 0)) }
}
