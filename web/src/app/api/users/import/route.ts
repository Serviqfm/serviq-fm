// web/src/app/api/users/import/route.ts
//
// 1C-28: bulk CSV onboarding of users/teams. Admin/manager only (same gate as the
// single-create route). Every user is pinned to the CALLER's org — never a
// client-supplied org — and the whole batch is seat-limited via planLimits
// (FAIL OPEN on unknown/unlimited plan). Deliberately a NEW route so it never
// touches the single-create /api/users route.
//
// Each row: email, full_name, role, optional full_name_ar, phone, team. Users are
// created with the SAME mechanism the single path uses (service-role auth.admin
// createUser + profile insert + welcome email with a CSPRNG temp password). A
// supplied team name is find-or-created within the org and the user is added to it.
//
// Teams-only mode (1C-28): a CSV with a `name` header and NO `email` header is
// treated as a teams import (name, name_ar) — find-or-create only, no users touched.

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { generateTempPassword } from '@/lib/tempPassword'
import { seatLimitReached, planLimits } from '@/lib/planLimits'
import { sanitizeCell } from '@/lib/csv'

export const dynamic = 'force-dynamic'

// Managers may create everyone except admins; only an admin caller may create admins.
const ROLES = ['technician', 'manager', 'requester', 'admin']
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_ROWS = 500

type Row = Record<string, string>

// sanitizeCell (lib/csv) neutralizes formula injection on any untrusted cell we
// echo back in an error/warning message.
const safeCell = sanitizeCell

export async function POST(req: NextRequest) {
  const serverSupabase = await createServerSupabaseClient()
  const { data: { user: caller } } = await serverSupabase.auth.getUser()
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: callerProfile } = await serverSupabase
    .from('users').select('organisation_id, role').eq('id', caller.id).single()
  if (!callerProfile?.organisation_id) return NextResponse.json({ error: 'No organisation' }, { status: 403 })
  if (!['admin', 'manager'].includes(callerProfile.role ?? '')) {
    return NextResponse.json({ error: 'Only a manager or admin can import users' }, { status: 403 })
  }
  // SECURITY: org is always the caller's — never from the request body.
  const orgId = callerProfile.organisation_id
  const callerIsAdmin = callerProfile.role === 'admin'

  const body = (await req.json().catch(() => ({}))) as { rows?: unknown }
  const rows = Array.isArray(body.rows) ? (body.rows as Row[]) : []
  if (rows.length === 0) return NextResponse.json({ error: 'No rows to import' }, { status: 400 })
  if (rows.length > MAX_ROWS) return NextResponse.json({ error: `Too many rows (max ${MAX_ROWS} per import)` }, { status: 400 })

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Supabase configuration missing' }, { status: 500 })
  }
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const norm = (s: string) => s.trim().toLowerCase()

  // Teams-only mode: `name` header present, `email` absent (parseCSV gives every
  // row the same headers, so checking the first row is enough). No seat limit —
  // teams are not seats.
  if (rows[0] && !('email' in rows[0]) && 'name' in rows[0]) {
    let created = 0
    const errors: string[] = []
    const warnings: string[] = []
    const { data: existingTeams } = await admin.from('teams').select('name').eq('organisation_id', orgId)
    const seen = new Set((existingTeams ?? []).map(t => norm(t.name ?? '')))
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      const ln = i + 2
      if (!r || typeof r !== 'object' || Array.isArray(r)) { errors.push(`Row ${ln}: malformed row`); continue }
      const name = (r.name ?? '').toString().trim()
      const nameAr = (r.name_ar ?? '').toString().trim()
      if (!name) { errors.push(`Row ${ln}: name is required`); continue }
      if (seen.has(norm(name))) { warnings.push(`Row ${ln}: team "${safeCell(name)}" already exists — skipped`); continue }
      const { error } = await admin.from('teams')
        .insert({ organisation_id: orgId, name, name_ar: nameAr || null })
      if (error) { errors.push(`Row ${ln}: ${error.message}`); continue }
      seen.add(norm(name))
      created++
    }
    return NextResponse.json({ created, errors, warnings })
  }

  // Seat limit for the WHOLE batch. FAIL OPEN — unknown/unlimited tier or any lookup
  // error leaves `cap` null and never blocks. `activeSeats` is the live active-user
  // count; it is bumped as we create so seatLimitReached() gates each row against
  // the running total, not just the starting count.
  const { data: orgRow } = await admin.from('organisations').select('plan_tier').eq('id', orgId).single()
  const planTier = orgRow?.plan_tier as string | null | undefined
  const cap = planLimits(planTier)?.maxSeats ?? null
  let activeSeats = 0
  if (cap != null) {
    const { count } = await admin
      .from('users').select('id', { count: 'exact', head: true })
      .eq('organisation_id', orgId).eq('is_active', true)
    activeSeats = typeof count === 'number' ? count : 0
  }

  // Preload existing emails (skip duplicates) and teams (find-or-create by name).
  const [existingUsersRes, teamsRes] = await Promise.all([
    admin.from('users').select('email').eq('organisation_id', orgId),
    admin.from('teams').select('id, name').eq('organisation_id', orgId),
  ])
  const existingEmails = new Set((existingUsersRes.data ?? []).map(u => norm(u.email ?? '')))
  const teamMap = new Map((teamsRes.data ?? []).map(t => [norm(t.name ?? ''), t.id]))

  // Resolve a team name to an id, creating the team in this org on first sight.
  async function resolveTeam(nameRaw: string, ln: number, warnings: string[]): Promise<string | undefined> {
    const key = norm(nameRaw)
    const hit = teamMap.get(key)
    if (hit) return hit
    const { data: team, error } = await admin
      .from('teams').insert({ organisation_id: orgId, name: nameRaw.trim() }).select('id').single()
    if (error || !team) { warnings.push(`Row ${ln}: could not create team "${safeCell(nameRaw)}" — user added without a team`); return undefined }
    teamMap.set(key, team.id)
    return team.id
  }

  let created = 0
  const errors: string[] = []
  const warnings: string[] = []

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    const ln = i + 2 // +1 for 0-index, +1 for the header line
    if (!r || typeof r !== 'object' || Array.isArray(r)) { errors.push(`Row ${ln}: malformed row`); continue }
    const get = (k: string) => (r[k] ?? '').toString().trim()

    const email = get('email')
    const fullName = get('full_name')
    const role = get('role').toLowerCase()

    if (!email || !EMAIL_RE.test(email)) { errors.push(`Row ${ln}: invalid email "${safeCell(email)}"`); continue }
    if (!fullName) { errors.push(`Row ${ln}: full_name is required`); continue }
    if (!ROLES.includes(role)) { errors.push(`Row ${ln}: invalid role "${safeCell(get('role'))}" (allowed: ${ROLES.join(', ')})`); continue }
    if (role === 'admin' && !callerIsAdmin) { errors.push(`Row ${ln}: only an admin can create admin users`); continue }
    if (existingEmails.has(norm(email))) { errors.push(`Row ${ln}: a user with email "${safeCell(email)}" already exists`); continue }

    // Seat gate for the whole batch — FAIL OPEN on unknown/unlimited tier.
    if (seatLimitReached(planTier, activeSeats)) {
      errors.push(`Row ${ln}: plan seat limit reached — upgrade your plan to add more team members`)
      continue
    }

    // Create the auth user (CSPRNG temp password, DV-09) then the profile.
    const tempPassword = generateTempPassword()
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email, password: tempPassword, email_confirm: true,
    })
    if (authError || !authData?.user) { errors.push(`Row ${ln}: ${authError?.message ?? 'could not create auth user'}`); continue }

    const { error: profileError } = await admin.from('users').insert({
      id: authData.user.id,
      email,
      full_name: fullName,
      full_name_ar: get('full_name_ar') || null,
      role,
      phone: get('phone') || null,
      organisation_id: orgId,
      is_active: true,
      invited_at: new Date().toISOString(),
      must_change_password: true,
    })
    if (profileError) {
      await admin.auth.admin.deleteUser(authData.user.id) // rollback orphan auth user
      errors.push(`Row ${ln}: ${profileError.message}`)
      continue
    }

    existingEmails.add(norm(email))
    activeSeats += 1
    created++

    // Optional team membership — find-or-create by name, warn (don't fail) on error.
    const teamName = get('team')
    if (teamName) {
      const teamId = await resolveTeam(teamName, ln, warnings)
      if (teamId) {
        const { error: memberErr } = await admin.from('team_members')
          .insert({ team_id: teamId, user_id: authData.user.id, organisation_id: orgId })
        if (memberErr) warnings.push(`Row ${ln}: user created but adding to team "${safeCell(teamName)}" failed`)
      }
    }

    // Welcome email carries the temp password (the invite mechanism). Non-fatal.
    try {
      const { notifyWelcomeEmail } = await import('@/lib/notifications/workOrderNotifications')
      await notifyWelcomeEmail(
        authData.user.id, email, fullName,
        `${process.env.NEXT_PUBLIC_APP_URL || 'https://serviqfm.com'}/login/employee`,
        tempPassword,
      )
    } catch (err) {
      console.error('Failed to send welcome email:', err)
    }
  }

  return NextResponse.json({ created, errors, warnings })
}
