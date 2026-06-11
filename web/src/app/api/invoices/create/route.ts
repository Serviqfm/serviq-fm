import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      work_order_id,
      service_charges,
      labor_hours,
      labor_rate,
      spare_parts,       // [{ name, qty, unit_cost, total }]
      surcharges,        // [{ label, amount }]
    } = body

    if (!work_order_id) {
      return NextResponse.json({ error: 'work_order_id required' }, { status: 400 })
    }

    const supabase = await createServerSupabaseClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('users')
      .select('organisation_id, role')
      .eq('id', user.id)
      .single()
    if (!profile?.organisation_id) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 403 })
    }
    if (!['admin', 'manager'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // The work order must belong to the caller's organisation.
    const { data: wo } = await supabase
      .from('work_orders')
      .select('id, organisation_id')
      .eq('id', work_order_id)
      .maybeSingle()
    if (!wo || wo.organisation_id !== profile.organisation_id) {
      return NextResponse.json({ error: 'Work order not found' }, { status: 404 })
    }

    const sc    = Number(service_charges ?? 0)
    const lh    = Number(labor_hours ?? 0)
    const lr    = Number(labor_rate ?? 0)
    const lc    = parseFloat((lh * lr).toFixed(2))
    const parts = Array.isArray(spare_parts) ? spare_parts : []
    const surch = Array.isArray(surcharges)  ? surcharges  : []

    const spare_parts_total = parseFloat(
      parts.reduce((sum: number, p: { total: number }) => sum + Number(p.total ?? 0), 0).toFixed(2)
    )
    const surcharges_total = parseFloat(
      surch.reduce((sum: number, s: { amount: number }) => sum + Number(s.amount ?? 0), 0).toFixed(2)
    )

    const subtotal   = parseFloat((sc + lc + spare_parts_total + surcharges_total).toFixed(2))
    const vat_amount = parseFloat((subtotal * 0.15).toFixed(2))
    const total      = parseFloat((subtotal + vat_amount).toFixed(2))

    const invoice_number = 'INV-' + new Date().getFullYear() + '-' + Date.now().toString().slice(-6)

    const { data: invoice, error: insertError } = await supabase
      .from('invoices')
      .insert({
        organisation_id: profile.organisation_id,
        work_order_id,
        invoice_number,
        service_charges: sc,
        labor_hours: lh,
        labor_rate: lr,
        labor_charges: lc,
        spare_parts: parts,
        spare_parts_total,
        surcharges: surch,
        subtotal,
        vat_amount,
        total,
        created_by: user.id,
      })
      .select('id, invoice_number')
      .single()

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    return NextResponse.json({ id: invoice.id, invoice_number: invoice.invoice_number })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
