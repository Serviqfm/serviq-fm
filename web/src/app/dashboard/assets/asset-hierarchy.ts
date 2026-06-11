// web/src/app/dashboard/assets/asset-hierarchy.ts
//
// Client-side helpers for the asset parent-child hierarchy (max 4 levels —
// the server enforces this in web/src/app/api/assets/hierarchy.ts).

export const MAX_ASSET_DEPTH = 4

export interface HierarchyAsset {
  id: string
  name: string
  parent_asset_id?: string | null
  site_id?: string | null
}

export interface FlatHierarchyAsset extends HierarchyAsset {
  depth: number // 0 = top-level
}

/**
 * Flattens an org's asset list into depth-first order with a `depth` per asset,
 * so a <select> can show children indented under their parents.
 * Tolerates bad data (cycles, missing parents) by appending leftovers at depth 0.
 */
export function flattenAssetTree(assets: HierarchyAsset[]): FlatHierarchyAsset[] {
  const byParent = new Map<string, HierarchyAsset[]>()
  const ids = new Set(assets.map(a => a.id))
  for (const a of assets) {
    const key = a.parent_asset_id && ids.has(a.parent_asset_id) ? a.parent_asset_id : ''
    const list = byParent.get(key) ?? []
    list.push(a)
    byParent.set(key, list)
  }
  const out: FlatHierarchyAsset[] = []
  const placed = new Set<string>()
  const visit = (parentKey: string, depth: number) => {
    const children = (byParent.get(parentKey) ?? []).slice()
    children.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
    for (const c of children) {
      if (placed.has(c.id)) continue
      placed.add(c.id)
      out.push({ ...c, depth })
      if (depth < MAX_ASSET_DEPTH + 2) visit(c.id, depth + 1)
    }
  }
  visit('', 0)
  for (const a of assets) {
    if (!placed.has(a.id)) {
      placed.add(a.id)
      out.push({ ...a, depth: 0 })
    }
  }
  return out
}

/** Returns the ids of every descendant of `rootId` (children, grandchildren, ...). */
export function getDescendantIds(assets: HierarchyAsset[], rootId: string): Set<string> {
  const byParent = new Map<string, string[]>()
  for (const a of assets) {
    if (!a.parent_asset_id) continue
    const list = byParent.get(a.parent_asset_id) ?? []
    list.push(a.id)
    byParent.set(a.parent_asset_id, list)
  }
  const result = new Set<string>()
  let frontier = [rootId]
  while (frontier.length > 0) {
    const next: string[] = []
    for (const id of frontier) {
      for (const childId of byParent.get(id) ?? []) {
        if (!result.has(childId)) {
          result.add(childId)
          next.push(childId)
        }
      }
    }
    frontier = next
  }
  return result
}
