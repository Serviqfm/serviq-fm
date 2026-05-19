// web/src/lib/fieldEnforcement.ts

import { createClient } from '@supabase/supabase-js'
import { FIELD_CATALOG, FieldPage, FieldVisibility } from './field-catalog'

function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true
  if (typeof v === 'string' && v.trim() === '') return true
  if (Array.isArray(v) && v.length === 0) return true
  return false
}

function getServiceRoleClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function getFieldConfig(
  orgId: string,
  page: FieldPage
): Promise<Map<string, FieldVisibility>> {
  const supabase = getServiceRoleClient()
  const { data } = await supabase
    .from('field_configs')
    .select('field_key, visibility')
    .eq('organisation_id', orgId)
    .eq('page', page)
  const overrides = new Map<string, FieldVisibility>(
    data?.map(r => [r.field_key, r.visibility as FieldVisibility]) ?? []
  )
  const merged = new Map<string, FieldVisibility>()
  for (const meta of FIELD_CATALOG[page]) {
    if (meta.is_system_required) {
      merged.set(meta.key, 'required')
    } else {
      merged.set(meta.key, overrides.get(meta.key) ?? meta.default_visibility)
    }
  }
  return merged
}

export async function enforceFieldConfig<T extends Record<string, unknown>>(
  orgId: string,
  page: FieldPage,
  payload: T
): Promise<{ cleaned: Partial<T> } | { error: string }> {
  const config = await getFieldConfig(orgId, page)
  const cleaned: Partial<T> = {}
  for (const [key, value] of Object.entries(payload)) {
    const visibility = config.get(key)
    if (visibility === undefined) {
      cleaned[key as keyof T] = value as T[keyof T]
      continue
    }
    if (visibility === 'hidden') continue
    if (visibility === 'required' && isEmpty(value)) {
      return { error: `Field "${key}" is required.` }
    }
    cleaned[key as keyof T] = value as T[keyof T]
  }
  for (const [key, vis] of Array.from(config.entries())) {
    if (vis === 'required' && (!(key in cleaned) || isEmpty(cleaned[key as keyof T]))) {
      return { error: `Field "${key}" is required.` }
    }
  }
  return { cleaned }
}

export async function seedFieldConfigsForOrg(orgId: string): Promise<void> {
  const supabase = getServiceRoleClient()
  const rows: { organisation_id: string; page: string; field_key: string; visibility: FieldVisibility }[] = []
  for (const [page, fields] of Object.entries(FIELD_CATALOG)) {
    for (const meta of fields) {
      rows.push({
        organisation_id: orgId,
        page,
        field_key: meta.key,
        visibility: meta.is_system_required ? 'required' : meta.default_visibility,
      })
    }
  }
  if (rows.length === 0) return
  await supabase
    .from('field_configs')
    .upsert(rows, { onConflict: 'organisation_id,page,field_key', ignoreDuplicates: true })
}
