import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { logPlatformAction } from '@/lib/platformAudit'

export const runtime = 'nodejs'

type LineItem = { description: string; qty: number; unit_price_cents: number }

async function gatePlatformAdmin() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { data: pa } = await admin.from('platform_admins').select('id').eq('id', user.id).single()
  if (!pa) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { user, admin }
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await gatePlatformAdmin()
  if ('error' in gate) return gate.error
  const { data } = await gate.admin
    .from('tenant_invoices')
    .select('*')
    .eq('organisation_id', params.id)
    .order('created_at', { ascending: false })
  return NextResponse.json({ invoices: data ?? [] })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await gatePlatformAdmin()
  if ('error' in gate) return gate.error
  const { admin, user } = gate

  const body = await req.json() as {
    line_items?: LineItem[]
    due_date?: string | null
    notes?: string | null
    vat_rate?: number  // 0.15 default
  }

  const items = Array.isArray(body.line_items) ? body.line_items : []
  if (items.length === 0) return NextResponse.json({ error: 'At least one line item is required' }, { status: 400 })

  const cleaned = items.map(li => ({
    description: String(li.description ?? '').trim() || 'Item',
    qty: Math.max(1, Number(li.qty) || 1),
    unit_price_cents: Math.round(Number(li.unit_price_cents) || 0),
    total_cents: Math.round((Number(li.qty) || 1) * (Number(li.unit_price_cents) || 0)),
  }))
  const subtotal = cleaned.reduce((s, li) => s + li.total_cents, 0)
  const vatRate = typeof body.vat_rate === 'number' ? body.vat_rate : 0.15
  const vat = Math.round(subtotal * vatRate)
  const total = subtotal + vat

  // DV-13: allocate the next sequential number via the DB function (batch-4-01) — the
  // old JS MAX-scan raced concurrent creates and its .limit(50) could miss the true max.
  // The unique index + one 23505 retry are the duplicate defense (allocation and insert
  // are separate transactions, so a concurrent create can be handed the same number).
  const insertTenantInvoice = async () => {
    const { data: num, error: numErr } = await admin.rpc('next_tenant_invoice_number', { org_id: params.id })
    if (numErr || !num) throw new Error(numErr?.message ?? 'Failed to allocate invoice number')
    const res = await admin.from('tenant_invoices').insert({
      organisation_id: params.id,
      invoice_number: num as string,
      line_items: cleaned,
      subtotal_cents: subtotal,
      vat_cents: vat,
      total_cents: total,
      status: 'draft',
      due_date: body.due_date ?? null,
      notes: body.notes ?? null,
      created_by: user.id,
    }).select().single()
    return { ...res, invoiceNumber: num as string }
  }

  let attempt
  try {
    attempt = await insertTenantInvoice()
    if (attempt.error?.code === '23505') attempt = await insertTenantInvoice()
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Allocation failed' }, { status: 500 })
  }
  const { data: inv, error, invoiceNumber } = attempt

  if (error || !inv) return NextResponse.json({ error: error?.message ?? 'Insert failed' }, { status: 500 })

  await logPlatformAction({
    platform_admin_id: user.id,
    action: 'tenant.invoice.created',
    target_organisation_id: params.id,
    details: { invoice_number: invoiceNumber, total_cents: total },
  })

  return NextResponse.json({ invoice: inv })
}
