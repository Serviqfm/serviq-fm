// web/src/app/api/work-orders/import/route.ts
//
// WO-11: bulk CSV import of work orders. Manager/admin only (bulk create +
// assignment is a management action, per CORE-20). Resolves site/asset/assignee/
// team by name/email, validates per row, and — when a wo_number is supplied —
// updates the matching existing WO instead of creating one. Uses the service-role
// client, so it bypasses the CORE-20/23 triggers (already role-gated here).
//
// Note: the update path is a deliberate admin override — it can set any target
// status directly (it does not re-apply the CORE-20 transition table), the same
// way a manager can already close/reopen via the service-role routes.

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

const CATEGORIES = ['HVAC', 'Electrical', 'Plumbing', 'Elevator / Lift', 'Fire Safety', 'Furniture', 'Kitchen Equipment', 'Pool / Gym', 'IT Equipment', 'Signage', 'Vehicle', 'Other']
const PRIORITIES = ['low', 'medium', 'high', 'critical']
const STATUSES = ['new', 'assigned', 'in_progress', 'on_hold', 'completed', 'closed']
const NUMERIC = /^\d+(\.\d+)?$/
const MAX_ROWS = 1000

type Row = Record<string, string>
type NameMap = { map: Map<string, string>; dup: Set<string> }

// Build a case-insensitive name→id map, tracking names that occur more than once
// (there is no unique-name constraint) so we can warn instead of silently picking one.
function buildNameMap(rows: { id: string; name?: string | null }[] | null): NameMap {
  const map = new Map<string, string>()
  const dup = new Set<string>()
  for (const r of rows ?? []) {
    const k = (r.name ?? '').trim().toLowerCase()
    if (!k) continue
    if (map.has(k)) dup.add(k)
    else map.set(k, r.id)
  }
  return { map, dup }
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('organisation_id, role').eq('id', user.id).single()
  if (!profile?.organisation_id) return NextResponse.json({ error: 'No organisation' }, { status: 403 })
  if (!['admin', 'manager'].includes(profile.role ?? '')) {
    return NextResponse.json({ error: 'Only a manager or admin can import work orders' }, { status: 403 })
  }
  const orgId = profile.organisation_id

  const body = (await req.json().catch(() => ({}))) as { rows?: unknown }
  const rows = Array.isArray(body.rows) ? (body.rows as Row[]) : []
  if (rows.length === 0) return NextResponse.json({ error: 'No rows to import' }, { status: 400 })
  if (rows.length > MAX_ROWS) return NextResponse.json({ error: `Too many rows (max ${MAX_ROWS} per import)` }, { status: 400 })

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Preload org lookup maps once (case-insensitive), so resolution is O(1) per row.
  const norm = (s: string) => s.trim().toLowerCase()
  const [sitesRes, assetsRes, usersRes, teamsRes] = await Promise.all([
    admin.from('sites').select('id, name').eq('organisation_id', orgId),
    admin.from('assets').select('id, name').eq('organisation_id', orgId),
    admin.from('users').select('id, email, role').eq('organisation_id', orgId),
    admin.from('teams').select('id, name').eq('organisation_id', orgId),
  ])
  const siteMap = buildNameMap(sitesRes.data)
  const assetMap = buildNameMap(assetsRes.data)
  const teamMap = buildNameMap(teamsRes.data)
  // Only technicians/managers are assignable (mirrors the assign UI); emails are unique.
  const userBy = new Map(
    (usersRes.data ?? [])
      .filter(u => u.email && ['technician', 'manager'].includes(u.role ?? ''))
      .map(u => [norm(u.email), u.id])
  )

  let created = 0
  let updated = 0
  const errors: string[] = []
  const warnings: string[] = []

  // Resolve a name against a NameMap, warning (not failing) on missing/ambiguous.
  const resolve = (nameRaw: string, nm: NameMap, kind: string, ln: number): string | undefined => {
    const k = norm(nameRaw)
    if (nm.dup.has(k)) { warnings.push(`Row ${ln}: ${kind} "${nameRaw}" is ambiguous (duplicate name) — left blank`); return undefined }
    const id = nm.map.get(k)
    if (!id) { warnings.push(`Row ${ln}: ${kind} "${nameRaw}" not found — left blank`); return undefined }
    return id
  }

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    const ln = i + 2 // +1 for 0-index, +1 for the header line
    if (!r || typeof r !== 'object' || Array.isArray(r)) { errors.push(`Row ${ln}: malformed row`); continue }
    const get = (k: string) => (r[k] ?? '').toString().trim()

    // Resolve every mapped column into `fields`; only non-empty cells are set, so
    // an update never blanks an existing value with an omitted column.
    const fields: Record<string, unknown> = {}
    const rowErrors: string[] = []

    if (get('description')) fields.description = get('description')

    if (get('priority')) {
      const p = get('priority').toLowerCase()
      if (!PRIORITIES.includes(p)) rowErrors.push(`invalid priority "${get('priority')}"`)
      else fields.priority = p
    }

    if (get('category')) {
      const match = CATEGORIES.find(c => norm(c) === norm(get('category')))
      if (!match) rowErrors.push(`invalid category "${get('category')}"`)
      else fields.category = match
    }

    if (get('status')) {
      const s = get('status').toLowerCase()
      if (!STATUSES.includes(s)) rowErrors.push(`invalid status "${get('status')}"`)
      else fields.status = s
    }

    if (get('site_name')) {
      const id = resolve(get('site_name'), siteMap, 'site', ln)
      if (id) fields.site_id = id
    }
    if (get('asset_name')) {
      const id = resolve(get('asset_name'), assetMap, 'asset', ln)
      if (id) fields.asset_id = id
    }
    if (get('team')) {
      const id = resolve(get('team'), teamMap, 'team', ln)
      if (id) fields.team_id = id
    }
    if (get('assignee_email')) {
      const id = userBy.get(norm(get('assignee_email')))
      if (!id) warnings.push(`Row ${ln}: assignee "${get('assignee_email')}" not found (or not a technician/manager) — left blank`)
      else fields.assigned_to = id
    }

    if (get('due_date')) {
      const raw = get('due_date')
      const d = new Date(raw)
      if (isNaN(d.getTime())) rowErrors.push(`invalid due_date "${raw}"`)
      // Date-only → local noon (matches the app's naive datetime-local convention,
      // avoiding the UTC-midnight off-by-one). A full datetime is stored verbatim.
      else fields.due_at = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T12:00:00` : raw
    }

    if (get('estimated_hours')) {
      if (!NUMERIC.test(get('estimated_hours'))) rowErrors.push(`invalid estimated_hours "${get('estimated_hours')}"`)
      else fields.estimated_duration_minutes = Math.round(parseFloat(get('estimated_hours')) * 60)
    }

    if (get('additional_cost')) {
      if (!NUMERIC.test(get('additional_cost'))) rowErrors.push(`invalid additional_cost "${get('additional_cost')}"`)
      else fields.actual_cost = parseFloat(get('additional_cost'))
    }

    if (rowErrors.length > 0) {
      errors.push(`Row ${ln}: ${rowErrors.join('; ')}`)
      continue
    }

    const title = get('title')
    const woNumRaw = get('wo_number')

    // Update path: a supplied wo_number (with or without a "WO-" prefix) must match
    // exactly one existing WO in this org.
    if (woNumRaw) {
      const digits = woNumRaw.replace(/^WO-?/i, '').trim()
      if (!/^\d+$/.test(digits)) { errors.push(`Row ${ln}: invalid wo_number "${woNumRaw}"`); continue }
      const woNum = parseInt(digits, 10)
      const { data: matches } = await admin
        .from('work_orders').select('id')
        .eq('organisation_id', orgId).eq('wo_number', woNum).limit(2)
      if (!matches || matches.length === 0) { errors.push(`Row ${ln}: wo_number ${woNum} not found in your organisation`); continue }
      if (matches.length > 1) { errors.push(`Row ${ln}: wo_number ${woNum} is ambiguous (multiple matches)`); continue }
      if (title) fields.title = title
      fields.updated_at = new Date().toISOString()
      const { error } = await admin.from('work_orders').update(fields).eq('id', matches[0].id).eq('organisation_id', orgId)
      if (error) errors.push(`Row ${ln}: ${error.message}`)
      else updated++
      continue
    }

    // Insert path: title is required; wo_number is DB-generated.
    if (!title) { errors.push(`Row ${ln}: title is required`); continue }
    const insertRow = {
      ...fields,
      organisation_id: orgId,
      created_by: user.id,
      source: 'manual',
      title,
      priority: fields.priority ?? 'medium',
      status: fields.status ?? (fields.assigned_to ? 'assigned' : 'new'),
    }
    const { error } = await admin.from('work_orders').insert(insertRow)
    if (error) errors.push(`Row ${ln}: ${error.message}`)
    else created++
  }

  return NextResponse.json({ created, updated, errors, warnings })
}
