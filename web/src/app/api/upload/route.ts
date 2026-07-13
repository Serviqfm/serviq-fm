import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const maxDuration = 60

// Server-side file upload. The browser sends multipart/form-data; we forward to Supabase
// Storage using the service-role key. This avoids relying on the storage.objects RLS being
// set up correctly for every Supabase project — we just enforce auth + org membership in
// app code here.
//
// POST /api/upload?bucket=work-order-media&prefix=<orgId>/<woId>
// multipart form field: 'file'
const ALLOWED_BUCKETS = new Set(['work-order-media', 'media', 'requests'])
// DV-10 allowlist, widened for the Files module (WO-05/WO-03): images, PDF, and MP4/MOV
// video. Still rejects executables/archives/scripts. The public `requests` bucket keeps
// its stricter bucket-level image/PDF policy (Batch 1), so video can't reach it.
const ALLOWED_UPLOAD_MIME = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
  'application/pdf',
  'video/mp4', 'video/quicktime',
])
// 40 MB (WO-03). Note: uploads stream through a serverless function, so very large
// videos are rejected here by design — signed direct-to-storage uploads are a follow-up.
const MAX_UPLOAD_BYTES = 40 * 1024 * 1024

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
  if (!profile?.organisation_id) return NextResponse.json({ error: 'No organisation' }, { status: 403 })

  const url = new URL(req.url)
  const bucket = url.searchParams.get('bucket') ?? 'work-order-media'
  const prefix = (url.searchParams.get('prefix') ?? profile.organisation_id).replace(/^\/+|\/+$/g, '')
  if (!ALLOWED_BUCKETS.has(bucket)) return NextResponse.json({ error: 'Bucket not allowed' }, { status: 400 })

  // Force the prefix to start with the caller's org id so files cannot be written across tenants.
  if (!prefix.startsWith(profile.organisation_id)) {
    return NextResponse.json({ error: 'Prefix must be scoped to your organisation' }, { status: 403 })
  }

  const form = await req.formData()
  const file = form.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'Missing file' }, { status: 400 })

  // DV-10: reject oversized or non-allowed types before reading the file into memory.
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: `File too large (max ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB)` }, { status: 413 })
  }
  if (!ALLOWED_UPLOAD_MIME.has(file.type)) {
    return NextResponse.json({ error: `Unsupported file type: ${file.type || 'unknown'}` }, { status: 415 })
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${prefix}/${Date.now()}-${safeName}`

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Make sure the bucket exists. If create fails because it already exists, that is fine.
  await admin.storage.createBucket(bucket, { public: bucket !== 'offboard-exports' }).catch(() => {})

  const buffer = Buffer.from(await file.arrayBuffer())
  const { error: upErr } = await admin.storage.from(bucket).upload(path, buffer, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  })
  if (upErr) {
    console.error('[upload] failed', upErr)
    return NextResponse.json({ error: upErr.message }, { status: 500 })
  }

  const { data: pub } = admin.storage.from(bucket).getPublicUrl(path)
  return NextResponse.json({ path, publicUrl: pub.publicUrl })
}
