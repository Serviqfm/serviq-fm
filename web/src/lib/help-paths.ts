// Route → Help Center guide key. Kept separate from help.ts so the contextual
// "?" link on every dashboard page doesn't bundle the full guide content.
// Must match en.json (help-paths.test.ts checks it).
export const HELP_PATHS: [string, string][] = [
  ['dashboard', '/dashboard'],
  ['work_orders', '/dashboard/work-orders'],
  ['requests', '/dashboard/requests'],
  ['assets', '/dashboard/assets'],
  ['asset_log', '/dashboard/asset-log'],
  ['asset_log_reports', '/dashboard/asset-log/reports'],
  ['pm', '/dashboard/pm-schedules'],
  ['meters', '/dashboard/meters'],
  ['inspections', '/dashboard/inspections'],
  ['inventory', '/dashboard/inventory'],
  ['sites', '/dashboard/sites'],
  ['vendors', '/dashboard/vendors'],
  ['purchase_orders', '/dashboard/purchase-orders'],
  ['invoices', '/dashboard/invoices'],
  ['billing', '/dashboard/billing'],
  ['users', '/dashboard/users'],
  ['teams', '/dashboard/teams'],
  ['files', '/dashboard/files'],
  ['compliance', '/dashboard/compliance'],
  ['reports', '/dashboard/reports'],
  ['reports_builder', '/dashboard/reports/builder'],
  ['security', '/dashboard/security'],
  ['developers', '/dashboard/developers'],
  ['settings', '/dashboard/settings'],
]

/** Guide key for an app route, by longest matching module path. */
export function moduleForPath(pathname: string): string | null {
  let best: [string, string] | null = null
  for (const e of HELP_PATHS) {
    const p = e[1]
    const hit = p === '/dashboard' ? pathname === p : pathname === p || pathname.startsWith(p + '/')
    if (hit && (!best || p.length > best[1].length)) best = e
  }
  return best?.[0] ?? null
}
