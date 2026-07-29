// web/src/lib/customRoles.ts
// W6-11 / 1C-32 — custom roles are a SUBTRACTIVE permission overlay on the fixed
// 4-role model. See SQL Files/w6-11-custom-roles.sql for the full rationale.
//
// The only rule that matters: authorization is ALWAYS decided by users.role.
// A custom role's `permissions` map can only DENY (an explicit `false`); it can
// never grant. custom_roles.base_role is a template label for the admin UI and is
// NEVER read to authorize anything.

import type { SupabaseClient } from '@supabase/supabase-js'

export type Capability =
  | 'can_manage_users'
  | 'can_view_financials'
  | 'can_delete_assets'
  | 'can_close_work_orders'
  | 'can_manage_pm'
  | 'can_manage_settings'
  | 'can_export_data'
  | 'can_manage_vendors'
  | 'can_approve_requests'
  | 'can_view_reports'

// The catalog the Settings > Roles page renders. Toggles read "this role MAY …";
// unchecking a box REMOVES the capability from whatever the base role could do.
export const CAPABILITIES: { key: Capability; en: string; ar: string }[] = [
  { key: 'can_manage_users',      en: 'Manage users',              ar: 'إدارة المستخدمين' },
  { key: 'can_view_financials',   en: 'View financials',           ar: 'عرض البيانات المالية' },
  { key: 'can_delete_assets',     en: 'Delete assets',             ar: 'حذف الأصول' },
  { key: 'can_close_work_orders', en: 'Close work orders',         ar: 'إغلاق أوامر العمل' },
  { key: 'can_manage_pm',         en: 'Manage PM schedules',       ar: 'إدارة جداول الصيانة الوقائية' },
  { key: 'can_manage_settings',   en: 'Manage settings',           ar: 'إدارة الإعدادات' },
  { key: 'can_export_data',       en: 'Export data',               ar: 'تصدير البيانات' },
  { key: 'can_manage_vendors',    en: 'Manage vendors',            ar: 'إدارة الموردين' },
  { key: 'can_approve_requests',  en: 'Approve requests',          ar: 'اعتماد الطلبات' },
  { key: 'can_view_reports',      en: 'View reports',              ar: 'عرض التقارير' },
]

export type CapabilityMap = Partial<Record<Capability, boolean>>

export type CustomRole = {
  id: string
  organisation_id: string
  name: string
  name_ar: string | null
  base_role: string
  permissions: CapabilityMap | null
  is_active: boolean
}

// The whole overlay, in one line: ONLY an explicit false denies. Anything else
// (no custom role, capability absent, true) keeps today's behavior.
export function capabilityAllowed(permissions: CapabilityMap | null | undefined, cap: Capability): boolean {
  return permissions?.[cap] !== false
}

// Validates a client-supplied custom_role_id for an ADMIN assignment flow: the row
// must exist AND belong to `orgId`. '' / null clears the overlay. Anything else is
// rejected outright so a foreign id can never reach the users table.
export async function verifyCustomRoleId(
  supabase: SupabaseClient,
  orgId: string,
  raw: unknown
): Promise<{ ok: true; value: string | null } | { ok: false }> {
  if (raw === null || raw === '') return { ok: true, value: null }
  if (typeof raw !== 'string') return { ok: false }
  const { data } = await supabase
    .from('custom_roles')
    .select('id')
    .eq('id', raw)
    .eq('organisation_id', orgId)
    .maybeSingle()
  return data ? { ok: true, value: raw } : { ok: false }
}

// Server-side lookup: does the caller's custom role explicitly DENY `cap`?
// Reads permissions only — never base_role, so this can never grant anything.
// Fails OPEN on any error (missing table/column before the migration is applied,
// network blip): the base-role gate has already passed at this point, so failing
// open here means "unchanged pre-W6-11 behavior", never an escalation.
export async function capabilityDeniedForUser(
  supabase: SupabaseClient,
  userId: string,
  cap: Capability
): Promise<boolean> {
  try {
    const { data: profile } = await supabase
      .from('users')
      .select('custom_role_id')
      .eq('id', userId)
      .maybeSingle()
    const roleId = (profile as { custom_role_id?: string | null } | null)?.custom_role_id
    if (!roleId) return false

    const { data: role } = await supabase
      .from('custom_roles')
      .select('permissions, is_active')
      .eq('id', roleId)
      .maybeSingle()
    const r = role as { permissions: CapabilityMap | null; is_active: boolean } | null
    if (!r || r.is_active === false) return false

    return !capabilityAllowed(r.permissions, cap)
  } catch {
    return false
  }
}
