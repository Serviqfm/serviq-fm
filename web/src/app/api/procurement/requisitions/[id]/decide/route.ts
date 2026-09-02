// web/src/app/api/procurement/requisitions/[id]/decide/route.ts
// POST { approve: boolean, comment?: string } — approve or reject one step.
//
// The route deliberately does NOT check who the approver is: decide_requisition()
// is the only gate that matters. It runs SECURITY DEFINER on the user session,
// finds the LOWEST pending step, and raises unless the caller is that step's named
// approver — so out-of-order approvals and non-approvers fail identically, in the
// DB, where the UI can't be talked out of it (playbook A3).

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { resolveCaller } from '@/app/api/purchase-orders/_helpers'
import { notifyCurrentApprover, notifyCreatorDecided } from '../../_notify'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const caller = await resolveCaller(['admin', 'manager', 'technician'])
  if (caller instanceof NextResponse) return caller

  const body = (await req.json().catch(() => ({}))) as { approve?: unknown; comment?: unknown }
  if (typeof body.approve !== 'boolean') {
    return NextResponse.json({ error: 'approve must be true or false' }, { status: 400 })
  }
  const comment = typeof body.comment === 'string' && body.comment.trim() !== '' ? body.comment.trim() : null

  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase.rpc('decide_requisition', {
    p_id: params.id,
    p_approve: body.approve,
    p_comment: comment,
  })
  if (error) {
    console.error('[requisitions decide] rpc failed', error)
    return NextResponse.json({ error: error.message || 'Failed to record the decision' }, { status: 400 })
  }

  const requisition = data as {
    id: string; organisation_id: string; status: string
    requisition_number: number | null; title: string | null; created_by: string | null
  }

  try {
    if (requisition.status === 'pending_approval') {
      // Chain advanced — ping whoever is up next.
      await notifyCurrentApprover(caller.admin, requisition)
    } else if (requisition.status === 'approved' || requisition.status === 'rejected') {
      await notifyCreatorDecided(
        caller.admin, requisition, requisition.created_by,
        requisition.status === 'approved', comment
      )
    }
  } catch (e) {
    console.error('[requisitions decide] notify failed', e)
  }

  return NextResponse.json({ requisition })
}
