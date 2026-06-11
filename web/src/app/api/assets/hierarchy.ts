// web/src/app/api/assets/hierarchy.ts
//
// Server-side validation for the asset parent-child hierarchy.
// The DB column (assets.parent_asset_id) is a plain self-referencing FK —
// the 4-level depth cap and cycle prevention live here.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = any // SupabaseClient (service-role); typed loosely to avoid generated-schema coupling

export const MAX_ASSET_DEPTH = 4

export type HierarchyCheck = { ok: true } | { ok: false; error: string }

/**
 * Validates assigning `parentId` as the parent of an asset.
 *
 * Checks:
 *  (a) parent exists and belongs to `organisationId`
 *  (b) no cycles — the asset being moved must not appear in the parent's ancestor chain
 *  (c) total depth ≤ MAX_ASSET_DEPTH — parent-chain depth + 1 + the deepest
 *      descendant level under the asset being moved
 *
 * For POST (new asset) pass `assetId = null`: only (a) and parent-chain depth apply.
 */
export async function validateParentAssignment(
  admin: AdminClient,
  organisationId: string,
  parentId: string,
  assetId: string | null
): Promise<HierarchyCheck> {
  if (assetId && parentId === assetId) {
    return { ok: false, error: 'An asset cannot be its own parent.' }
  }

  // (a) Parent must exist in the same organisation.
  const { data: parent, error: parentErr } = await admin
    .from('assets')
    .select('id, organisation_id, parent_asset_id')
    .eq('id', parentId)
    .single()
  if (parentErr || !parent) {
    return { ok: false, error: 'Parent asset not found.' }
  }
  if (parent.organisation_id !== organisationId) {
    return { ok: false, error: 'Parent asset belongs to a different organisation.' }
  }

  // (b) Walk up the parent's ancestor chain — counts depth and detects cycles.
  // chainDepth = number of nodes from the parent up to its root (parent itself = 1).
  let chainDepth = 1
  const seen = new Set<string>([parent.id])
  let cursor: string | null = parent.parent_asset_id ?? null
  while (cursor && chainDepth <= MAX_ASSET_DEPTH) {
    if (assetId && cursor === assetId) {
      return { ok: false, error: 'Cannot set a descendant of this asset as its parent (circular hierarchy).' }
    }
    if (seen.has(cursor)) {
      return { ok: false, error: 'Circular asset hierarchy detected. Please choose a different parent.' }
    }
    seen.add(cursor)
    chainDepth++
    const { data: node } = await admin
      .from('assets')
      .select('id, parent_asset_id')
      .eq('id', cursor)
      .single()
    if (!node) break
    cursor = node.parent_asset_id ?? null
  }

  // (c) For a move (PATCH), the asset's own subtree counts toward the limit.
  // subtreeHeight = number of levels below the asset being moved.
  let subtreeHeight = 0
  if (assetId) {
    const visited = new Set<string>([assetId])
    let frontier: string[] = [assetId]
    while (frontier.length > 0 && subtreeHeight <= MAX_ASSET_DEPTH) {
      const { data: children } = await admin
        .from('assets')
        .select('id')
        .in('parent_asset_id', frontier)
      if (!children || children.length === 0) break
      const next: string[] = []
      for (const c of children as { id: string }[]) {
        if (!visited.has(c.id)) {
          visited.add(c.id)
          next.push(c.id)
        }
      }
      if (next.length === 0) break
      subtreeHeight++
      frontier = next
    }
  }

  if (chainDepth + 1 + subtreeHeight > MAX_ASSET_DEPTH) {
    return {
      ok: false,
      error: assetId
        ? `Maximum hierarchy depth is ${MAX_ASSET_DEPTH} levels. Moving this asset here would exceed it (its own child assets count toward the limit).`
        : `Maximum hierarchy depth is ${MAX_ASSET_DEPTH} levels. The selected parent is already at the deepest allowed level.`,
    }
  }

  return { ok: true }
}
