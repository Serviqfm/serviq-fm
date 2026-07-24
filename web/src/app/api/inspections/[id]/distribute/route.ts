import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { inspectionPdfBuffer, type InspectionRecord } from '@/lib/inspection-pdf'
import { sendEmail } from '@/lib/email'
import { captureError } from '@/lib/errorLog'

export const runtime = 'nodejs'

// CORE-28: email the completed-inspection PDF to the template's recipients.
// Best-effort — a generate/send failure is logged but never surfaces as an
// error to the caller, so the inspection submission itself is never blocked.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users')
    .select('organisation_id, organisation:organisation_id(name)')
    .eq('id', user.id)
    .single() as { data: { organisation_id: string; organisation: { name: string } | null } | null }
  if (!profile?.organisation_id) return NextResponse.json({ error: 'No organisation' }, { status: 403 })

  try {
    const { data: insp } = await supabase
      .from('inspection_results')
      .select('*, template:template_id(name, vertical, items, recipients), conductor:conducted_by(full_name, email), site:site_id(name, city), asset:asset_id(name, qr_code)')
      .eq('id', params.id)
      .eq('organisation_id', profile.organisation_id)
      .single() as { data: (InspectionRecord & { template?: { recipients?: string[] | null } | null }) | null }

    if (!insp) return NextResponse.json({ error: 'Inspection not found' }, { status: 404 })

    const recipients = (insp.template?.recipients ?? []).filter(Boolean)
    if (recipients.length === 0) return NextResponse.json({ ok: true, sent: 0 })

    const orgName = profile.organisation?.name ?? 'Organisation'
    const templateName = insp.template?.name ?? 'Inspection'
    const overall = String(insp.overall_result ?? '—')

    const buffer = await inspectionPdfBuffer(insp, orgName)

    const html = `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Inspection Completed: ${templateName}</h2>
      <p>An inspection has been completed by <strong>${insp.conductor?.full_name ?? insp.conductor?.email ?? 'a technician'}</strong>.</p>
      <p><strong>Result:</strong> ${overall}${insp.site?.name ? ` · <strong>Site:</strong> ${insp.site.name}` : ''}</p>
      <p>The full inspection report is attached as a PDF.</p>
    </div>`

    const { success, error } = await sendEmail(
      recipients,
      `Inspection Completed: ${templateName} — ${overall}`,
      html,
      [{ filename: `inspection-${params.id}.pdf`, content: buffer }],
    )
    if (!success) throw new Error(error ?? 'email send failed')

    return NextResponse.json({ ok: true, sent: recipients.length })
  } catch (err) {
    // Best-effort: log but report success so the submission flow is never blocked.
    await captureError(err, { route: 'inspections/distribute', orgId: profile.organisation_id })
    return NextResponse.json({ ok: false, error: 'distribution failed' })
  }
}
