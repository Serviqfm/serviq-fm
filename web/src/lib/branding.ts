// MKT-27 — per-tenant custom branding helpers (shared by the settings page, the
// invoice PDF route, and the public request portal).
//
// SECURITY: a brand colour is user-supplied text that gets interpolated into CSS /
// inline styles / PDF styles. It MUST pass isHexColor before it ever touches a style
// string, or an admin could inject arbitrary CSS. Anything that doesn't validate
// falls back to the default brand — the feature fails safe to ServIQ's default look.

export const HEX_RE = /^#[0-9a-fA-F]{6}$/

export function isHexColor(v: unknown): v is string {
  return typeof v === 'string' && HEX_RE.test(v)
}

// The logo is fetched server-side by the PDF renderer, so restrict it to our own
// Supabase storage origin (SSRF guard). If the env is missing we require https at
// minimum rather than blocking the feature entirely.
export function isSafeLogoUrl(v: unknown): v is string {
  if (typeof v !== 'string' || !v.trim()) return false
  let u: URL
  try { u = new URL(v) } catch { return false }
  if (u.protocol !== 'https:') return false
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (base) {
    try { return u.origin === new URL(base).origin } catch { return true }
  }
  return true
}

export type OrgBranding = {
  brand_logo_url?: string | null
  brand_primary_color?: string | null
  brand_secondary_color?: string | null
}

export type ResolvedBranding = {
  logoUrl: string | null
  primary: string | null
  secondary: string | null
}

// Returns validated branding to apply, or null when the feature is off / unset /
// entirely invalid (caller then renders the default brand).
// `enabled` is the custom_branding flag — callers resolve it and default permissive.
export function resolveBranding(org: OrgBranding | null | undefined, enabled: boolean): ResolvedBranding | null {
  if (!enabled || !org) return null
  const primary = isHexColor(org.brand_primary_color) ? org.brand_primary_color : null
  const secondary = isHexColor(org.brand_secondary_color) ? org.brand_secondary_color : null
  const logoUrl = isSafeLogoUrl(org.brand_logo_url) ? org.brand_logo_url : null
  if (!primary && !secondary && !logoUrl) return null
  return { logoUrl, primary, secondary }
}
