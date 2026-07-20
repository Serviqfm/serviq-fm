import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

// FM-21 — invoice status workflow. Guarded transitions; paid/void are terminal
// so a paid invoice can never be silently un-paid.
const ALLOWED: Record<string, string[]> = {
  draft: ['sent', 'void'],
  sent: ['paid', 'void'],
  paid: [],
  void: [],
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { status } = await req.json()
    if (!['sent', 'paid', 'void'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('users').select('organisation_id, role').eq('id', user.id).single()
    if (!profile?.organisation_id) return NextResponse.json({ error: 'Profile not found' }, { status: 403 })
    if (!['admin', 'manager'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { data: inv } = await supabase
      .from('invoices').select('id, status, organisation_id').eq('id', id).maybeSingle()
    if (!inv || inv.organisation_id !== profile.organisation_id) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }
    if (!ALLOWED[inv.status]?.includes(status)) {
      return NextResponse.json({ error: `Cannot move ${inv.status} → ${status}` }, { status: 409 })
    }

    const patch: Record<string, unknown> = { status }
    if (status === 'sent') patch.sent_at = new Date().toISOString()
    if (status === 'paid') patch.paid_at = new Date().toISOString()

    const { error } = await supabase
      .from('invoices').update(patch).eq('id', id).eq('organisation_id', profile.organisation_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true, status })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
}
