// web/src/app/api/purchase-orders/[id]/receive/route.ts
// POST — receive a PO: atomically flips status→received, bumps inventory stock, and
// writes one stock_transactions ledger row per line. All the work happens inside the
// receive_purchase_order() DB function (org-verified via auth.uid(), idempotent), so it
// MUST run on the user-session client — not the service-role admin client.

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users').select('role').eq('id', user.id).single()
  if (!profile || !['admin', 'manager'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data, error } = await supabase.rpc('receive_purchase_order', { p_po_id: params.id })
  if (error) {
    console.error('[purchase-orders receive] rpc failed', error)
    return NextResponse.json({ error: error.message || 'Failed to receive purchase order' }, { status: 400 })
  }

  return NextResponse.json({ purchase_order: data })
}
