// Goals & Recurring screen + category map editor (Plan 2 Task 13). Four
// sections: (1) detectRecurring() candidates the user confirms/dismisses
// into appState.recurringConfirmed, with an "expected recurring" total; (2)
// CRUD on appState.goals with a feasibility read (goalMath.goalFeasibility)
// against trailing free cash flow; (3) a ranked list of still-uncategorized
// labels (goalMath.uncategorizedRanking) the user maps to a category,
// writing appState.categoryOverrides; (4) export/import the whole AppState
// as JSON.
//
// State-mutation note: screens are props-driven, but there's no persistence
// wiring yet (Task 14 adds App.tsx -> saveState + re-render). Until then
// this screen keeps its own local copy of AppState (seeded from the `state`
// prop once, on mount) and calls `onStateChange` — if the caller passed
// one — on every edit, so Task 14 only has to plug a listener in, not
// restructure this component.
import { useMemo, useState } from 'react'
import type { ChangeEvent } from 'react'
import { round2 } from '../../lib/mathUtils'
import { SEED_CATEGORIES } from '../../lib/normalize'
import { goalFeasibility, uncategorizedRanking } from '../../lib/goalMath'
import type { GoalFeasibility } from '../../lib/goalMath'
import { detectRecurring } from '../../lib/recurring'
import { exportJSON, importJSON } from '../../state/appState'
import type { AppState, Goal } from '../../state/appState'
import type { MonthData } from '../../types'
import { PacingBar } from '../charts/PacingBar'
import { EmptyState, Money, Section, StatCard } from '../shared'

export interface GoalsScreenProps {
  months: MonthData[]
  state: AppState
  now: Date
  onStateChange?: (next: AppState) => void
}

const eurFmt = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
const fmtEUR = (v: number) => (Number.isFinite(v) ? eurFmt.format(v) : eurFmt.format(0))

// Every category the seed map assigns to, alphabetized for a stable <select>
// order. Deliberately does NOT include 'uncategorized' itself: this dropdown
// only ever renders next to a row that `uncategorizedRanking()` already
// found to be uncategorized, so assigning it 'uncategorized' would be a
// no-op override — a wasted key in categoryOverrides. To send a label back
// to uncategorized, remove its existing override instead (the list below).
const CATEGORY_OPTIONS = [...new Set(Object.values(SEED_CATEGORIES))].sort()

interface GoalDraft {
  id?: string
  name: string
  targetEUR: string
  targetDate: string
  currentEUR: string
  note: string
}

const EMPTY_DRAFT: GoalDraft = { name: '', targetEUR: '', targetDate: '', currentEUR: '', note: '' }

function draftFromGoal(g: Goal): GoalDraft {
  return {
    id: g.id,
    name: g.name,
    targetEUR: String(g.targetEUR),
    targetDate: g.targetDate ?? '',
    currentEUR: g.currentEUR != null ? String(g.currentEUR) : '',
    note: g.note ?? '',
  }
}

/** null when the draft doesn't have enough to make a valid Goal (blank
 * name, non-positive/non-numeric target) — the form's native `required`/
 * `min` attributes stop most of this before submit, this is the last
 * defensive check. */
function goalFromDraft(draft: GoalDraft, id: string): Goal | null {
  const name = draft.name.trim()
  const targetEUR = Number(draft.targetEUR)
  if (!name || !Number.isFinite(targetEUR) || targetEUR <= 0) return null
  const goal: Goal = { id, name, targetEUR }
  if (draft.targetDate) goal.targetDate = draft.targetDate
  if (draft.note.trim()) goal.note = draft.note.trim()
  if (draft.currentEUR.trim() !== '') {
    const currentEUR = Number(draft.currentEUR)
    if (Number.isFinite(currentEUR)) goal.currentEUR = currentEUR
  }
  return goal
}

/** Four badge states, not three — `monthsRemaining == null` (no targetDate
 * at all) and `monthsRemaining <= 0` (a targetDate that's already gone by)
 * both leave `feasible` null, but they're not the same situation for the
 * user: one just hasn't set a date yet, the other needs a decision (push
 * the date or top it up). Distinguishing them needs `monthsRemaining`
 * itself, not just the derived `feasible` flag. */
function FeasibilityBadge({ feasibility }: { feasibility: GoalFeasibility | undefined }) {
  if (!feasibility || feasibility.monthsRemaining == null) {
    return (
      <span className="goal-badge" data-tone="neutral">
        No date
      </span>
    )
  }
  if (feasibility.monthsRemaining <= 0) {
    return (
      <span className="goal-badge" data-tone="warning">
        Date passed
      </span>
    )
  }
  return feasibility.feasible ? (
    <span className="goal-badge" data-tone="good">
      Feasible
    </span>
  ) : (
    <span className="goal-badge" data-tone="warning">
      Tight
    </span>
  )
}

export function Goals({ months, state: initialState, now, onStateChange }: GoalsScreenProps) {
  const [state, setState] = useState<AppState>(initialState)
  const [draft, setDraft] = useState<GoalDraft | null>(null)
  const [importError, setImportError] = useState<string | null>(null)

  const commit = (next: AppState) => {
    setState(next)
    onStateChange?.(next)
  }

  // --- Recurring -----------------------------------------------------
  const recurring = useMemo(() => detectRecurring(months), [months])
  const confirmedSet = useMemo(() => new Set(state.recurringConfirmed), [state.recurringConfirmed])
  const unconfirmedRecurring = recurring.filter((r) => !confirmedSet.has(r.normLabel))
  const confirmedRecurring = recurring.filter((r) => confirmedSet.has(r.normLabel))
  const expectedRecurringTotal = round2(confirmedRecurring.reduce((sum, r) => sum + r.medianAmountEUR, 0))

  const toggleRecurring = (normLabel: string) => {
    const recurringConfirmed = confirmedSet.has(normLabel)
      ? state.recurringConfirmed.filter((l) => l !== normLabel)
      : [...state.recurringConfirmed, normLabel]
    commit({ ...state, recurringConfirmed })
  }

  // --- Goals -----------------------------------------------------------
  const feasibility = useMemo(() => goalFeasibility(state.goals, months, now), [state.goals, months, now])
  const feasibilityByGoal = useMemo(() => new Map(feasibility.map((f) => [f.goalId, f])), [feasibility])

  const saveGoal = () => {
    if (!draft) return
    const id = draft.id ?? crypto.randomUUID()
    const goal = goalFromDraft(draft, id)
    if (!goal) return
    const goals = draft.id ? state.goals.map((g) => (g.id === id ? goal : g)) : [...state.goals, goal]
    commit({ ...state, goals })
    setDraft(null)
  }

  const deleteGoal = (id: string, name: string) => {
    if (!window.confirm(`Delete goal "${name}"?`)) return
    commit({ ...state, goals: state.goals.filter((g) => g.id !== id) })
  }

  // --- Category map editor ---------------------------------------------
  const ranking = useMemo(() => uncategorizedRanking(months, state.categoryOverrides), [months, state.categoryOverrides])
  const overrideEntries = Object.entries(state.categoryOverrides).sort((a, b) => a[0].localeCompare(b[0]))

  const setOverride = (normLabel: string, category: string) => {
    commit({ ...state, categoryOverrides: { ...state.categoryOverrides, [normLabel]: category } })
  }

  const removeOverride = (normLabel: string) => {
    const categoryOverrides = { ...state.categoryOverrides }
    delete categoryOverrides[normLabel]
    commit({ ...state, categoryOverrides })
  }

  // --- Data: export / import --------------------------------------------
  const handleExport = () => {
    const blob = new Blob([exportJSON(state)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'finance-planner-state.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // let the same file be re-picked later
    if (!file) return
    setImportError(null)
    file
      .text()
      .then((text) => {
        let next: AppState
        try {
          next = importJSON(text)
        } catch (err) {
          setImportError(err instanceof Error ? err.message : String(err))
          return
        }
        if (window.confirm('Replace the current goals, category overrides, and settings with the imported file?')) {
          commit(next)
        }
      })
      .catch((err) => setImportError(err instanceof Error ? err.message : String(err)))
  }

  return (
    <div className="goals-screen">
      <Section title="Recurring expenses">
        <div className="stat-grid">
          <StatCard
            label="Expected recurring (this month)"
            value={<Money amountEUR={expectedRecurringTotal} />}
            sub={`${confirmedRecurring.length} confirmed`}
          />
        </div>

        <p className="chart-subtitle">Needs review</p>
        {unconfirmedRecurring.length === 0 ? (
          <EmptyState message="No new recurring candidates — everything worth tracking is already confirmed." />
        ) : (
          <ul className="recurring-list">
            {unconfirmedRecurring.map((r) => (
              <li className="recurring-row" key={r.normLabel}>
                <span className="recurring-name">{r.normLabel}</span>
                <span className="recurring-chip" data-cadence={r.cadence}>
                  {r.cadence}
                </span>
                <span className="recurring-figures">
                  <Money amountEUR={r.medianAmountEUR} tabular />
                  <span className="recurring-hitrate">{Math.round(r.hitRate * 100)}% of months</span>
                </span>
                <button type="button" className="recurring-action" onClick={() => toggleRecurring(r.normLabel)}>
                  Confirm
                </button>
              </li>
            ))}
          </ul>
        )}

        <p className="chart-subtitle">Confirmed</p>
        {confirmedRecurring.length === 0 ? (
          <EmptyState message="No confirmed recurring expenses yet." />
        ) : (
          <ul className="recurring-list">
            {confirmedRecurring.map((r) => (
              <li className="recurring-row" key={r.normLabel}>
                <span className="recurring-name">{r.normLabel}</span>
                <span className="recurring-chip" data-cadence={r.cadence}>
                  {r.cadence}
                </span>
                <span className="recurring-figures">
                  <Money amountEUR={r.medianAmountEUR} tabular />
                  <span className="recurring-hitrate">{Math.round(r.hitRate * 100)}% of months</span>
                </span>
                <button type="button" className="recurring-action" onClick={() => toggleRecurring(r.normLabel)}>
                  Dismiss
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="Goals"
        actions={
          !draft && (
            <button type="button" className="goal-add-btn" onClick={() => setDraft(EMPTY_DRAFT)}>
              Add goal
            </button>
          )
        }
      >
        {draft && (
          <form
            className="goal-form"
            onSubmit={(e) => {
              e.preventDefault()
              saveGoal()
            }}
          >
            <label className="goal-form-field">
              Name
              <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required />
            </label>
            <label className="goal-form-field">
              Target €
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={draft.targetEUR}
                onChange={(e) => setDraft({ ...draft, targetEUR: e.target.value })}
                required
              />
            </label>
            <label className="goal-form-field">
              Target date (optional)
              <input type="date" value={draft.targetDate} onChange={(e) => setDraft({ ...draft, targetDate: e.target.value })} />
            </label>
            <label className="goal-form-field">
              Current € (optional)
              <input
                type="number"
                step="0.01"
                value={draft.currentEUR}
                onChange={(e) => setDraft({ ...draft, currentEUR: e.target.value })}
              />
            </label>
            <label className="goal-form-field goal-form-field-wide">
              Note (optional)
              <input value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
            </label>
            <div className="goal-form-actions">
              <button type="submit">Save</button>
              <button type="button" onClick={() => setDraft(null)}>
                Cancel
              </button>
            </div>
          </form>
        )}

        {state.goals.length === 0 ? (
          <EmptyState message="No goals yet — add one to start tracking progress toward it." />
        ) : (
          <div className="goal-cards">
            {state.goals.map((g) => {
              const f = feasibilityByGoal.get(g.id)
              return (
                <div className="goal-card" key={g.id}>
                  <div className="goal-card-head">
                    <h4 className="goal-card-name">{g.name}</h4>
                    <div className="goal-card-actions">
                      <button type="button" onClick={() => setDraft(draftFromGoal(g))}>
                        Edit
                      </button>
                      <button type="button" onClick={() => deleteGoal(g.id, g.name)}>
                        Delete
                      </button>
                    </div>
                  </div>
                  <PacingBar
                    label="Progress"
                    plannedEUR={g.targetEUR}
                    spentEUR={g.currentEUR ?? 0}
                    formatValue={fmtEUR}
                    direction="fill"
                  />
                  <div className="goal-card-meta">
                    <FeasibilityBadge feasibility={f} />
                    {f?.requiredPerMonth != null ? (
                      <span className="goal-card-note">
                        Need {fmtEUR(f.requiredPerMonth)}/mo · avg free cash flow {fmtEUR(f.avgFreeCashFlow)}/mo
                      </span>
                    ) : g.targetDate ? (
                      <span className="goal-card-note">Target date has already passed.</span>
                    ) : (
                      <span className="goal-card-note">Add a target date to see a feasibility estimate.</span>
                    )}
                    {g.note && <p className="goal-card-note">{g.note}</p>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Section>

      <Section title="Category map">
        <p className="chart-subtitle">Top uncategorized labels</p>
        {ranking.length === 0 ? (
          <EmptyState message="Nothing uncategorized — every label maps to a category." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Label</th>
                  <th>Count</th>
                  <th>Total</th>
                  <th>Assign</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((r) => (
                  <tr key={r.normLabel}>
                    <td>{r.normLabel}</td>
                    <td>{r.count}</td>
                    <td>
                      <Money amountEUR={r.totalEUR} tabular />
                    </td>
                    <td>
                      <select
                        className="category-select"
                        value=""
                        onChange={(e) => setOverride(r.normLabel, e.target.value)}
                        aria-label={`Assign a category to ${r.normLabel}`}
                      >
                        <option value="" disabled>
                          Assign…
                        </option>
                        {CATEGORY_OPTIONS.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="chart-subtitle">Overrides</p>
        {overrideEntries.length === 0 ? (
          <EmptyState message="No category overrides yet." />
        ) : (
          <ul className="override-list">
            {overrideEntries.map(([label, category]) => (
              <li className="override-row" key={label}>
                <span className="override-label">{label}</span>
                <span className="override-category">{category}</span>
                <button type="button" onClick={() => removeOverride(label)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Data">
        <div className="data-actions">
          <button type="button" onClick={handleExport}>
            Export JSON
          </button>
          <label className="data-import-label">
            Import JSON
            <input type="file" accept="application/json" onChange={handleImport} />
          </label>
        </div>
        {importError && <p className="data-import-error">{importError}</p>}
      </Section>
    </div>
  )
}
