// web/src/lib/workspace.ts
// P0 (playbook §2 A2): the tenant's chosen workspace, cached client-side only.
// Deliberately NOT a context provider — the flags themselves live on
// organisations and are enforced in middleware; this is just which nav a
// both-workspace user last picked.
export type Workspace = 'cafm' | 'procurement'
export const WORKSPACE_KEY = 'serviqfm_workspace'

export function readWorkspace(): Workspace | null {
  try {
    const v = localStorage.getItem(WORKSPACE_KEY)
    return v === 'cafm' || v === 'procurement' ? v : null
  } catch {
    return null
  }
}

export function writeWorkspace(w: Workspace): void {
  try { localStorage.setItem(WORKSPACE_KEY, w) } catch { /* private mode — fall back to path-derived nav */ }
}
