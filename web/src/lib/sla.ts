// web/src/lib/sla.ts — FM-03 SLA policy engine (pure helpers, no I/O).

const MIN = 60_000

export type SlaTargets = { response_minutes: number | null; resolution_minutes: number | null }

// Due dates derived from a policy at WO-create time. A non-positive/absent minute value
// yields null (no target). Callers apply these only when the user left due_at empty.
export function slaDueDates(policy: SlaTargets | null, nowMs: number): {
  sla_response_due_at: string | null
  due_at: string | null
} {
  const at = (m: number | null | undefined) =>
    typeof m === 'number' && m > 0 ? new Date(nowMs + m * MIN).toISOString() : null
  return {
    sla_response_due_at: at(policy?.response_minutes),
    due_at: at(policy?.resolution_minutes),
  }
}

// SLA-clock bookkeeping for a status transition. Returns ONLY the fields that change,
// so the caller can spread it over an update payload. Empty object = nothing to do.
export function slaTransitionPatch(args: {
  prevStatus: string
  newStatus: string
  firstResponseAt: string | null
  slaPausedAt: string | null
  slaPausedTotalMinutes: number
  nowMs: number
}): Record<string, unknown> {
  const { prevStatus, newStatus, firstResponseAt, slaPausedAt, slaPausedTotalMinutes, nowMs } = args
  const patch: Record<string, unknown> = {}
  const nowIso = new Date(nowMs).toISOString()

  // First response: the first time the WO enters in_progress.
  if (newStatus === 'in_progress' && prevStatus !== 'in_progress' && !firstResponseAt) {
    patch.first_response_at = nowIso
  }
  // Enter on_hold: start the pause clock (resolution SLA stops ticking).
  if (newStatus === 'on_hold' && prevStatus !== 'on_hold') {
    patch.sla_paused_at = nowIso
  }
  // Leave on_hold: bank the elapsed minutes and clear the marker.
  if (prevStatus === 'on_hold' && newStatus !== 'on_hold' && slaPausedAt) {
    const elapsed = Math.max(0, Math.round((nowMs - Date.parse(slaPausedAt)) / MIN))
    patch.sla_paused_total_minutes = (slaPausedTotalMinutes || 0) + elapsed
    patch.sla_paused_at = null
  }
  return patch
}
