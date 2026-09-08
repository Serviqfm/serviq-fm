// Budget maths + the block message (P5). Pure, so the thresholds that stop
// spending can be tested without a database.
//
// submit_requisition() raises a machine-readable exception rather than UI copy:
//   BUDGET_EXCEEDED|<requested>|<reserved>|<actual>|<budget>
// The API parses it here and hands the numbers to the UI, which renders them in
// the caller's language. The database never carries English or Arabic prose.

export const BUDGET_WARN_PERCENTS = [90, 75] as const

export type BudgetBreach = {
  requested: number
  reserved: number
  actual: number
  budget: number
}

// Matched anywhere in the string and bounded to four numeric fields: Postgres
// wraps the raised message in its own ERROR/CONTEXT scaffolding, so the payload
// arrives with text both before AND after it.
const BREACH_RE = /BUDGET_EXCEEDED\|(-?\d+(?:\.\d+)?)\|(-?\d+(?:\.\d+)?)\|(-?\d+(?:\.\d+)?)\|(-?\d+(?:\.\d+)?)/

/** Returns the four numbers behind a budget block, or null if this is a different error. */
export function parseBudgetError(message: string | null | undefined): BudgetBreach | null {
  if (!message) return null
  const m = BREACH_RE.exec(message)
  if (!m) return null
  const [requested, reserved, actual, budget] = m.slice(1, 5).map(Number)
  return { requested, reserved, actual, budget }
}

export type BudgetUsage = {
  used: number
  remaining: number
  percent: number | null
  /** The highest warning threshold crossed, or null. `full` once the budget is gone. */
  level: 'ok' | 'warn' | 'full' | null
  crossed: number | null
}

/**
 * Where a cost center stands. `percent` is null when there is no budget to
 * measure against — an unbudgeted center is not "0% used", it is unmeasured, and
 * the two must not render the same.
 */
export function budgetUsage(input: { reserved: number; actual: number; amount: number }): BudgetUsage {
  const used = input.reserved + input.actual
  const remaining = input.amount - used
  if (!(input.amount > 0)) {
    return { used, remaining, percent: null, level: null, crossed: null }
  }
  const percent = Math.round((used / input.amount) * 1000) / 10
  const crossed = BUDGET_WARN_PERCENTS.find(p => percent >= p) ?? null
  return {
    used,
    remaining,
    percent,
    level: percent >= 100 ? 'full' : crossed !== null ? 'warn' : 'ok',
    crossed: percent >= 100 ? 100 : crossed,
  }
}
