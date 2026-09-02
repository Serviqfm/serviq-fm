// Notification emission for the requisition workflow (P1).
// Two call sites (submit, decide) share these, so they live next to the routes —
// dedup, not a speculative abstraction (same posture as purchase-orders/_helpers.ts).
//
// Everything here is best-effort: a failed notify must never fail an approval that
// the DB already committed. Callers `void` these or wrap in try/catch.

import type { SupabaseClient } from '@supabase/supabase-js'
import { NotificationService } from '@/lib/NotificationService'
import { escapeHtml } from '@/lib/escapeHtml'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://serviqfm.com'

type Requisition = {
  id: string
  requisition_number?: number | null
  title?: string | null
  organisation_id: string
}

function link(id: string): string {
  return `${APP_URL}/dashboard/procurement/requisitions/${id}`
}

function label(req: Requisition): string {
  return req.requisition_number ? `REQ #${req.requisition_number}` : 'Requisition'
}

async function userContact(
  admin: SupabaseClient,
  userId: string
): Promise<{ id: string; email: string; full_name: string | null } | null> {
  const { data } = await admin
    .from('users')
    .select('id, email, full_name')
    .eq('id', userId)
    .maybeSingle()
  return data?.email ? (data as { id: string; email: string; full_name: string | null }) : null
}

// Tells the approver whose turn it now is. Called after submit AND after each
// approval, so a chain advancing from step 1 to step 2 pings step 2.
export async function notifyCurrentApprover(admin: SupabaseClient, req: Requisition): Promise<void> {
  const { data: step } = await admin
    .from('requisition_approvals')
    .select('approver_user_id, label')
    .eq('requisition_id', req.id)
    .eq('status', 'pending')
    .order('step_order')
    .limit(1)
    .maybeSingle()
  if (!step?.approver_user_id) return

  const approver = await userContact(admin, step.approver_user_id)
  if (!approver) return

  const title = `${label(req)} needs your approval`
  const body = req.title ?? ''
  const url = link(req.id)

  await Promise.allSettled([
    NotificationService.insertInApp(approver.id, req.organisation_id, 'req_pending_approval', {
      title,
      body,
      link: url,
      // One nudge per approver per requisition; a resubmit after rejection is a
      // new decision point, so the step label is part of the key.
      dedupeKey: `req_pending:${req.id}:${step.label ?? ''}:${approver.id}`,
      localized: {
        ar: { title: `${label(req)} بانتظار موافقتك`, body },
      },
    }),
    NotificationService.notify(approver.id, 'req_pending_approval', {
      email: approver.email,
      subject: title,
      htmlContent: `
        <div style="font-family: Arial, sans-serif; max-width: 600px;">
          <h2>${escapeHtml(title)}</h2>
          <p><strong>Requisition:</strong> ${escapeHtml(req.title ?? '')}</p>
          ${step.label ? `<p><strong>Your step:</strong> ${escapeHtml(step.label)}</p>` : ''}
          <p><a href="${url}">Review the requisition</a></p>
        </div>
      `,
      pushTitle: title,
      pushBody: body,
      pushData: { requisitionId: req.id },
    }),
  ])
}

// Tells the creator the chain finished (approved) or stopped (rejected).
export async function notifyCreatorDecided(
  admin: SupabaseClient,
  req: Requisition,
  createdBy: string | null,
  approved: boolean,
  comment: string | null
): Promise<void> {
  if (!createdBy) return
  const creator = await userContact(admin, createdBy)
  if (!creator) return

  const verdict = approved ? 'approved' : 'rejected'
  const title = `${label(req)} was ${verdict}`
  const body = comment ?? req.title ?? ''
  const url = link(req.id)

  await Promise.allSettled([
    NotificationService.insertInApp(creator.id, req.organisation_id, 'req_decided', {
      title,
      body,
      link: url,
      localized: {
        ar: { title: `${label(req)} ${approved ? 'تمت الموافقة عليه' : 'تم رفضه'}`, body },
      },
    }),
    NotificationService.notify(creator.id, 'req_decided', {
      email: creator.email,
      subject: title,
      htmlContent: `
        <div style="font-family: Arial, sans-serif; max-width: 600px;">
          <h2>${escapeHtml(title)}</h2>
          <p><strong>Requisition:</strong> ${escapeHtml(req.title ?? '')}</p>
          ${comment ? `<p><strong>Comment:</strong> ${escapeHtml(comment)}</p>` : ''}
          <p><a href="${url}">Open the requisition</a></p>
        </div>
      `,
      pushTitle: title,
      pushBody: body,
      pushData: { requisitionId: req.id },
    }),
  ])
}
