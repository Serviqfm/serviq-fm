import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { renderStandardReport, isStandardReportType } from '@/lib/reports/standardReport'

export const runtime = 'nodejs'

export async function GET(_req: NextRequest, { params }: { params: { type: string } }) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('users').select('organisation_id, organisation:organisation_id(name)').eq('id', user.id).single() as { data: { organisation_id: string; organisation: { name: string } | null } | null }
  if (!profile?.organisation_id) return NextResponse.json({ error: 'No organisation' }, { status: 403 })

  const type = params.type
  if (!isStandardReportType(type)) return NextResponse.json({ error: 'Unknown report type' }, { status: 400 })

  const buffer = await renderStandardReport(supabase, type, profile.organisation_id, profile.organisation?.name ?? 'Organisation')
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${type}-${new Date().toISOString().slice(0, 10)}.pdf"`,
    },
  })
}
