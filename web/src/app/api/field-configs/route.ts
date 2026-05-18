// web/src/app/api/field-configs/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import { getFieldConfig } from '@/lib/fieldEnforcement'
import { FieldPage, ALL_PAGES } from '@/lib/field-catalog'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile, error: profileErr } = await supabase
    .from('users')
    .select('organisation_id')
    .eq('id', user.id)
    .single()
  if (profileErr) {
    console.error('[field-configs] users lookup failed', profileErr)
    return NextResponse.json({ error: 'Failed to load user profile' }, { status: 500 })
  }
  if (!profile?.organisation_id) {
    return NextResponse.json({ error: 'No organisation' }, { status: 403 })
  }

  const page = req.nextUrl.searchParams.get('page') as FieldPage | null
  if (!page || !ALL_PAGES.includes(page)) {
    return NextResponse.json({ error: 'Invalid or missing page param' }, { status: 400 })
  }

  try {
    const config = await getFieldConfig(profile.organisation_id, page)
    return NextResponse.json({ config: Object.fromEntries(config) })
  } catch (err) {
    console.error('[field-configs] getFieldConfig failed', err)
    return NextResponse.json({ error: 'Failed to load field config' }, { status: 500 })
  }
}
