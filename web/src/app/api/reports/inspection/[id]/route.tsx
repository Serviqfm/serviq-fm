import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { inspectionPdfBuffer, type InspectionRecord } from '@/lib/inspection-pdf'

export const runtime = 'nodejs'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('organisation_id, organisation:organisation_id(name)').eq('id', user.id).single() as { data: { organisation_id: string; organisation: { name: string } | null } | null }
  if (!profile?.organisation_id) return NextResponse.json({ error: 'No organisation' }, { status: 403 })

  const { data: insp } = await supabase
    .from('inspection_results')
    .select('*, template:template_id(name, vertical, items), conductor:conducted_by(full_name, email), site:site_id(name, city), asset:asset_id(name, qr_code)')
    .eq('id', params.id)
    .eq('organisation_id', profile.organisation_id)
    .single() as { data: InspectionRecord | null }

  if (!insp) return NextResponse.json({ error: 'Inspection not found' }, { status: 404 })

  const orgName = profile.organisation?.name ?? 'Organisation'
  const buffer = await inspectionPdfBuffer(insp, orgName)
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="inspection-${params.id}.pdf"`,
    },
  })
}
