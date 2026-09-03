// Pure PO helpers (P2). Extracted from the status route and the vendor detail
// page so the two rules people actually rely on — "a PO never moves backwards"
// and "this vendor delivers on time X% of the time" — are unit-testable rather
// than only observable through the UI.

export const PO_LIFECYCLE = ['draft', 'sent', 'acknowledged', 'in_transit', 'received'] as const
export type PoStatus = (typeof PO_LIFECYCLE)[number]

// Statuses the status route may set. 'sent' belongs to the send route (it means
// the vendor was emailed) and 'received' to receive_purchase_order() (it moves
// stock), so neither is settable by a plain status advance.
export const PO_MANUAL_ADVANCE = ['acknowledged', 'in_transit'] as const

export type AdvanceCheck =
  | { ok: true }
  | { ok: false; reason: 'not_advanceable' | 'terminal' | 'backwards' }

/** Forward-only lifecycle rule. `current` may be any stored status, including cancelled. */
export function canAdvance(current: string, target: string): AdvanceCheck {
  if (!(PO_MANUAL_ADVANCE as readonly string[]).includes(target)) return { ok: false, reason: 'not_advanceable' }
  const from = PO_LIFECYCLE.indexOf(current as PoStatus)
  // cancelled (and anything unknown) is not on the lifecycle at all.
  if (from === -1) return { ok: false, reason: 'terminal' }
  if (PO_LIFECYCLE.indexOf(target as PoStatus) <= from) return { ok: false, reason: 'backwards' }
  return { ok: true }
}

export type DeliveryRecord = { expected_at?: string | null; received_at?: string | null }

/**
 * On-time delivery from received POs. Only orders that both landed AND carried a
 * promised date can be judged, so anything else is excluded from BOTH halves of
 * the fraction rather than counted as a miss.
 *
 * expected_at is a DATE: arriving any time on the promised day is on time. The
 * deadline is built in UTC — received_at is a UTC instant, and parsing the
 * deadline without a zone would silently move it by the server's offset (east of
 * UTC that marks genuinely on-time deliveries late).
 */
export function onTimeDelivery(pos: DeliveryRecord[]): { onTime: number; total: number; percent: number | null } {
  const judged = pos.filter(p => p.expected_at && p.received_at)
  const onTime = judged.filter(
    p => new Date(p.received_at as string) <= new Date(`${p.expected_at as string}T23:59:59.999Z`)
  ).length
  return {
    onTime,
    total: judged.length,
    percent: judged.length === 0 ? null : Math.round((onTime / judged.length) * 100),
  }
}
