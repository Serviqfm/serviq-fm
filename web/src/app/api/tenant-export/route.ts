import { NextResponse } from 'next/server'
import JSZip from 'jszip'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { sanitizeCell } from '@/lib/csv'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

// AP-09 — tenant self-service export of the org's core data as a zip of CSVs.
// Org is resolved from the caller's session (never the request); admins only.

// Tables to dump: label -> user-facing columns. `users` deliberately omits any
// auth/secret fields (passwords live in auth.users; must_change_password etc. are
// excluded). '*' dumps every column for tables with no secrets.
const EXPORTS: { table: string; columns: string }[] = [
  { table: 'sites', columns: '*' },
  { table: 'assets', columns: '*' },
  { table: 'work_orders', columns: '*' },
  { table: 'invoices', columns: '*' },
  { table: 'users', columns: 'id, full_name, full_name_ar, email, role, phone, job_title, is_active, created_at' },
]

function toCSV(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return ''
  const headers = Object.keys(rows[0])
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return ''
    const s = sanitizeCell(typeof v === 'string' ? v : (typeof v === 'object' ? JSON.stringify(v) : String(v)))
    return `"${s.replace(/"/g, '""')}"`
  }
  return [headers.join(','), ...rows.map(r => headers.map(h => esc(r[h])).join(','))].join('\n')
}

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users')
    .select('organisation_id, role')
    .eq('id', user.id)
    .single()
  if (!profile?.organisation_id) return NextResponse.json({ error: 'No organisation' }, { status: 403 })
  if (profile.role !== 'admin') return NextResponse.json({ error: 'Admins only' }, { status: 403 })

  const orgId = profile.organisation_id as string
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const zip = new JSZip()
  const dumps = await Promise.all(EXPORTS.map(async ({ table, columns }) => {
    const { data, error } = await admin.from(table).select(columns).eq('organisation_id', orgId)
    return { table, data, error }
  }))
  for (const { table, data, error } of dumps) {
    if (error) { zip.file(`${table}.error.txt`, error.message); continue }
    zip.file(`${table}.csv`, toCSV((data as unknown as Record<string, unknown>[]) ?? []))
  }

  const buffer = await zip.generateAsync({ type: 'nodebuffer' })
  const stamp = new Date().toISOString().slice(0, 10)
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="serviq-export-${stamp}.zip"`,
    },
  })
}
