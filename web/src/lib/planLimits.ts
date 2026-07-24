// AP-02 / AP-12 — plan-tier limits and feature flags, keyed on organisations.plan_tier.
// Tiers in use across the app: 'small' | 'medium' | 'enterprise' (see settings page,
// mobile AuthContext). Nothing else reads plan_tier today, so paid tiers are honor-system
// until these are enforced.
//
// FAIL OPEN is the governing rule: if plan_tier is null/unknown or a limit is unset, callers
// must ALLOW. These helpers return null (no limit) / true (feature on) in those cases so an
// existing org with a missing/renamed tier is never broken.

export type PlanLimits = {
  maxSeats: number | null // null = unlimited
  apiAccess: boolean
  maxSites: number | null // null = unlimited
  maxOpenWorkOrders: number | null // null = unlimited; counts WOs not in (completed, closed)
  storageGb: number | null // null = unlimited; displayed metric only (not enforced)
}

// null on a numeric field = unlimited for that tier.
const PLAN_LIMITS: Record<string, PlanLimits> = {
  small: { maxSeats: 10, apiAccess: false, maxSites: 3, maxOpenWorkOrders: 200, storageGb: 5 },
  medium: { maxSeats: 50, apiAccess: true, maxSites: 15, maxOpenWorkOrders: 2000, storageGb: 50 },
  enterprise: { maxSeats: null, apiAccess: true, maxSites: null, maxOpenWorkOrders: null, storageGb: null },
}

// Returns the limits for a tier, or null when the tier is missing/unknown (FAIL OPEN — caller allows).
export function planLimits(planTier: string | null | undefined): PlanLimits | null {
  if (!planTier) return null
  return PLAN_LIMITS[planTier] ?? null
}

// Generic count gate against one numeric cap. Unknown tier / unlimited cap => false (allow).
function limitReached(cap: number | null | undefined, current: number): boolean {
  if (cap == null) return false
  return current >= cap
}

// Seat gate: true only when the tier is known AND has a numeric cap AND currentSeats >= cap.
// Unknown tier / unlimited cap => false (allow).
export function seatLimitReached(planTier: string | null | undefined, currentSeats: number): boolean {
  return limitReached(planLimits(planTier)?.maxSeats, currentSeats)
}

// Site gate: same shape as the seat gate. Unknown tier / unlimited cap => false (allow).
export function siteLimitReached(planTier: string | null | undefined, currentSites: number): boolean {
  return limitReached(planLimits(planTier)?.maxSites, currentSites)
}

// Open-work-order gate. currentOpen = WOs whose status is not (completed, closed).
// Unknown tier / unlimited cap => false (allow).
export function openWorkOrderLimitReached(planTier: string | null | undefined, currentOpen: number): boolean {
  return limitReached(planLimits(planTier)?.maxOpenWorkOrders, currentOpen)
}

// api_access gate default from plan. Unknown tier => true (FAIL OPEN — allow).
export function planAllowsApiAccess(planTier: string | null | undefined): boolean {
  const limits = planLimits(planTier)
  if (!limits) return true
  return limits.apiAccess
}

// ponytail: custom_branding flag exists in tenant_feature_flags but has no code consumer today
// — not modeled here until something reads it.
// ponytail: storageGb is a displayed metric only — measuring actual bucket bytes per org is not
// cheap (no aggregate table exists), so it's shown on the usage page, not enforced at upload.
