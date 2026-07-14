// AG-6 — Asset Log QR landing. A scanned label points at /al/{qr_token}.
// Not under the /dashboard middleware matcher, so this component does its own
// auth: unauthenticated scanners are sent to the login portal; signed-in scanners
// get the token resolved via the RLS'd anon client (foreign token → no row →
// notFound) and redirected to the item detail. No org id is trusted from the URL
// — RLS on asset_log_items scopes the lookup to the caller's org.

import { redirect, notFound } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export default async function AssetLogQrLandingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = await createServerSupabaseClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: item } = await supabase
    .from('asset_log_items')
    .select('id')
    .eq('qr_token', token)
    .maybeSingle()

  if (!item) notFound()
  redirect(`/dashboard/asset-log/${item.id}`)
}
