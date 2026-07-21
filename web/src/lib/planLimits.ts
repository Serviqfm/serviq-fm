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
}

// null maxSeats = unlimited seats for that tier.
const PLAN_LIMITS: Record<string, PlanLimits> = {
  small: { maxSeats: 10, apiAccess: false },
  medium: { maxSeats: 50, apiAccess: true },
  enterprise: { maxSeats: null, apiAccess: true },
}

// Returns the limits for a tier, or null when the tier is missing/unknown (FAIL OPEN — caller allows).
export function planLimits(planTier: string | null | undefined): PlanLimits | null {
  if (!planTier) return null
  return PLAN_LIMITS[planTier] ?? null
}

// Seat gate: true only when the tier is known AND has a numeric cap AND currentSeats >= cap.
// Unknown tier / unlimited cap => false (allow).
export function seatLimitReached(planTier: string | null | undefined, currentSeats: number): boolean {
  const limits = planLimits(planTier)
  if (!limits || limits.maxSeats == null) return false
  return currentSeats >= limits.maxSeats
}

// api_access gate default from plan. Unknown tier => true (FAIL OPEN — allow).
export function planAllowsApiAccess(planTier: string | null | undefined): boolean {
  const limits = planLimits(planTier)
  if (!limits) return true
  return limits.apiAccess
}

// ponytail: custom_branding flag exists in tenant_feature_flags but has no code consumer today
// — not modeled here until something reads it.
