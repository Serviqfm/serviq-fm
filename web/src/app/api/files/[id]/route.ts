// web/src/app/api/files/[id]/route.ts
//
// WO-05: delete a file record AND its underlying storage object (the client can't
// remove service-role-uploaded objects, so this runs server-side). file_attachments
// cascade via ON DELETE CASCADE, so the file also detaches from every entity.

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

const BUCKET = 'work-order-media'
const PUBLIC_MARKER = `/object/public/${BUCKET}/`

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!id) return NextResponse.json({ error: 'Missing file id' }, { status: 400 })

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
  if (!profile?.organisation_id) return NextResponse.json({ error: 'No organisation' }, { status: 403 })

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: file } = await admin.from('files').select('id, url, organisation_id').eq('id', id).maybeSingle()
  if (!file || file.organisation_id !== profile.organisation_id) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }

  // Best-effort storage cleanup — derive the object path from the public URL.
  const markerIdx = (file.url as string).indexOf(PUBLIC_MARKER)
  if (markerIdx !== -1) {
    const path = decodeURIComponent((file.url as string).slice(markerIdx + PUBLIC_MARKER.length))
    if (path) await admin.storage.from(BUCKET).remove([path]).catch(() => {})
  }

  const { error } = await admin.from('files').delete().eq('id', id).eq('organisation_id', profile.organisation_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
