// Stock availability + the "not enough stock" message (P9). Pure, so the rule
// that stops a requisition from over-drawing the shelf is testable without a DB.
//
// requisitions_stock_effects() raises a machine-readable exception rather than UI
// copy, exactly like BUDGET_EXCEEDED:
//   STOCK_SHORT|<item name>|<requested>|<available>
// The API parses it here and hands the numbers to the UI, which renders them in
// the caller's language.

export type LineType = 'purchase' | 'stock'

/**
 * A 'stock' line is issued from inventory instead of going to a purchase order.
 * Anything unrecognised is a purchase line — the pre-P9 behaviour, and the DB
 * column default.
 */
export function lineType(v: unknown): LineType {
  return v === 'stock' ? 'stock' : 'purchase'
}

export type StockShort = {
  item: string
  requested: number
  available: number
}

// Bounded to two numeric fields at the end so an item name containing a pipe
// cannot swallow them. Matched anywhere: Postgres wraps the raised message in
// its own ERROR/CONTEXT scaffolding.
const SHORT_RE = /STOCK_SHORT\|(.*?)\|(-?\d+(?:\.\d+)?)\|(-?\d+(?:\.\d+)?)(?:\s|$)/

/** Returns the item and the numbers behind a stock block, or null for a different error. */
export function parseStockError(message: string | null | undefined): StockShort | null {
  if (!message) return null
  const m = SHORT_RE.exec(message)
  if (!m) return null
  return { item: m[1], requested: Number(m[2]), available: Number(m[3]) }
}

/**
 * What a requester may actually take: stock on the shelf minus what other
 * requisitions are already holding. Never negative — an over-drawn item reads as
 * "none available", not as a negative number the UI would have to special-case.
 */
export function availableStock(item: {
  stock_quantity?: number | string | null
  reserved_quantity?: number | string | null
}): number {
  const stock = Number(item.stock_quantity ?? 0)
  const reserved = Number(item.reserved_quantity ?? 0)
  return Math.max(0, (Number.isFinite(stock) ? stock : 0) - (Number.isFinite(reserved) ? reserved : 0))
}
