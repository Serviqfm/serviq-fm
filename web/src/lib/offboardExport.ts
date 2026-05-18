import JSZip from 'jszip'
import { createClient } from '@supabase/supabase-js'

const TENANT_TABLES = [
  'organisations', 'users', 'sites', 'spaces', 'assets',
  'work_orders', 'pm_schedules', 'invoices', 'audit_logs',
  'requests', 'inspection_results', 'notification_log', 'tenant_feature_flags',
]

function toCSV(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return ''
  const headers = Object.keys(rows[0])
  const escape = (v: unknown) => {
    if (v === null || v === undefined) return ''
    const s = typeof v === 'string' ? v : JSON.stringify(v)
    return `"${s.replace(/"/g, '""')}"`
  }
  return [headers.join(','), ...rows.map(r => headers.map(h => escape(r[h])).join(','))].join('\n')
}

export async function buildOffboardZip(orgId: string): Promise<{ buffer: Buffer; filename: string }> {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const zip = new JSZip()
  for (const table of TENANT_TABLES) {
    const column = table === 'organisations' ? 'id' : 'organisation_id'
    const { data, error } = await admin.from(table).select('*').eq(column, orgId)
    if (error) {
      zip.file(`${table}.error.txt`, error.message)
      continue
    }
    zip.file(`${table}.csv`, toCSV((data as Record<string, unknown>[]) ?? []))
  }
  const buffer = await zip.generateAsync({ type: 'nodebuffer' })
  const filename = `${orgId}/${new Date().toISOString().replace(/[:.]/g, '-')}.zip`
  return { buffer, filename }
}

export async function uploadOffboardZip(filename: string, buffer: Buffer): Promise<string> {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { error } = await admin.storage.from('offboard-exports').upload(filename, buffer, {
    contentType: 'application/zip',
    upsert: false,
  })
  if (error) throw new Error('Upload failed: ' + error.message)
  const { data: signed } = await admin.storage.from('offboard-exports').createSignedUrl(filename, 30 * 86400) // 30 days
  return signed?.signedUrl ?? ''
}
