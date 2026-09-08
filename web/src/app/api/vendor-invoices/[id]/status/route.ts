import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { capabilityDeniedForUser } from '@/lib/customRoles'

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

// P4 — the FINANCE decision that follows a 3-way match. Separate from the payment
// status above: match_status is "does this invoice agree with the PO and what we
// received", status is "where is it in the pay run". Only a matched (or already
// disputed) invoice can be approved for payment; approving one that failed the
// match is exactly what the match exists to prevent.
const MATCH_ALLOWED: Record<string, string[]> = {
  unmatched:            ['disputed'],
  matched:              ['approved_for_payment', 'disputed'],
  mismatch:             ['disputed'],
  approved_for_payment: ['disputed'],
  disputed:             ['approved_for_payment'],
}

// Keep the payment status in step, using only transitions MKT-18 already allows.
const PAYMENT_SIDE_EFFECT: Record<string, string> = {
  approved_for_payment: 'approved',
  disputed:             'disputed',
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const status = body?.status
    const matchStatus = body?.match_status

    // Exactly one of the two lifecycles per request.
    if (matchStatus === undefined && !['approved', 'paid', 'disputed'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }
    if (matchStatus !== undefined && !['approved_for_payment', 'disputed'].includes(matchStatus)) {
      return NextResponse.json({ error: 'Invalid match_status' }, { status: 400 })
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

    // W6-11: a custom role can SUBTRACT the financial capability. Releasing money
    // for payment is the clearest case for honouring that denial.
    if (matchStatus !== undefined
        && await capabilityDeniedForUser(supabase, user.id, 'can_view_financials')) {
      return NextResponse.json(
        { error: 'Forbidden', code: 'capability_denied', capability: 'can_view_financials' },
        { status: 403 }
      )
    }

    const { data: inv } = await supabase
      .from('vendor_invoices').select('id, status, match_status, organisation_id').eq('id', id).maybeSingle()
    if (!inv || inv.organisation_id !== profile.organisation_id) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    if (matchStatus !== undefined) {
      const current = (inv.match_status as string) ?? 'unmatched'
      if (!MATCH_ALLOWED[current]?.includes(matchStatus)) {
        return NextResponse.json({ error: `Cannot move ${current} → ${matchStatus}` }, { status: 409 })
      }

      const update: Record<string, unknown> = {
        match_status: matchStatus,
        updated_at: new Date().toISOString(),
      }
      // Move the payment status along too, but only where MKT-18 permits it —
      // a paid invoice is never dragged back open by a match decision.
      const nextPayment = PAYMENT_SIDE_EFFECT[matchStatus]
      if (nextPayment && ALLOWED[inv.status]?.includes(nextPayment)) update.status = nextPayment

      const { data: mUpdated, error: mErr } = await supabase
        .from('vendor_invoices')
        .update(update)
        .eq('id', id)
        .eq('organisation_id', profile.organisation_id)
        .eq('match_status', current)
        .select('id, status, match_status')
      if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 })
      if (!mUpdated || mUpdated.length === 0) {
        return NextResponse.json({ error: 'Invoice changed — refresh and retry' }, { status: 409 })
      }
      return NextResponse.json({ ok: true, ...mUpdated[0] })
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
