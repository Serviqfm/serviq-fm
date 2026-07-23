import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

// MKT-18 — vendor-invoice status workflow, mirroring FM-21 (api/invoices/[id]/status).
// pending → approved → paid; disputed reachable from pending/approved; paid and
// disputed are terminal so a paid invoice can never be silently un-paid.
// Requires "SQL Files/w6-1-vendor-invoice-status.sql" (widens the status CHECK).
const ALLOWED: Record<string, string[]> = {
  pending:  ['approved', 'disputed'],
  approved: ['paid', 'disputed'],
  paid:     [],
  disputed: [],
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { status } = await req.json()
    if (!['approved', 'paid', 'disputed'].includes(status)) {
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
      .from('vendor_invoices').select('id, status, organisation_id').eq('id', id).maybeSingle()
    if (!inv || inv.organisation_id !== profile.organisation_id) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }
    if (!ALLOWED[inv.status]?.includes(status)) {
      return NextResponse.json({ error: `Cannot move ${inv.status} → ${status}` }, { status: 409 })
    }

    // Compare-and-swap on the status we validated against, so two concurrent
    // transitions can't both pass the check and race a paid invoice back open.
    const { data: updated, error } = await supabase
      .from('vendor_invoices')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('organisation_id', profile.organisation_id)
      .eq('status', inv.status)
      .select('id')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!updated || updated.length === 0) {
      return NextResponse.json({ error: 'Invoice changed — refresh and retry' }, { status: 409 })
    }

    return NextResponse.json({ ok: true, status })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
}
