// AP-13 — Monthly auto-draft of platform tenant invoices for bank-transfer tenants.
// For every ACTIVE, non-Stripe (bank-transfer) tenant with a positive MRR, draft one
// tenant_invoice for the current billing month, carrying a ZATCA Phase-2 QR.
// Idempotent per (tenant, billing_period): the partial unique index
// uq_tenant_invoices_org_period (w6-6-tenant-invoice-autodraft.sql) makes a re-run
// a no-op — a second insert in the same month hits 23505 and is skipped.
//
// Auth: requires Authorization: Bearer ${CRON_SECRET}, fails closed if unset.
// Wired in vercel.json -> crons (monthly).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateZATCAQRData } from '@/lib/zatca'
import { captureAndAlert } from '@/lib/errorLog'

const ROUTE = '/api/cron/tenant-invoice-autodraft'

export const runtime = 'nodejs'
export const maxDuration = 60

const VAT_RATE = 0.15

type OrgRow = {
  id: string
  name: string | null
  plan: string | null
  mrr_cents: number | null
}

// 'YYYY-MM' for the current month (UTC).
function currentPeriod(): string {
  return new Date().toISOString().slice(0, 7)
}

async function run() {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const period = currentPeriod()
  let drafted = 0
  let skipped = 0
  const errors: string[] = []

  // Active bank-transfer tenants: not offboarded, no Stripe subscription, positive MRR.
  const { data: orgs, error: orgErr } = await admin
    .from('organisations')
    .select('id, name, plan, mrr_cents')
    .is('offboarded_at', null)
    .is('stripe_subscription_id', null)
    .gt('mrr_cents', 0)
    .returns<OrgRow[]>()
  if (orgErr) return { error: orgErr.message, drafted, skipped }

  for (const org of orgs ?? []) {
    try {
      // Idempotency pre-check; the unique index is the real backstop below.
      const { data: existing } = await admin
        .from('tenant_invoices')
        .select('id')
        .eq('organisation_id', org.id)
        .eq('billing_period', period)
        .maybeSingle()
      if (existing) { skipped++; continue }

      const mrr = org.mrr_cents ?? 0
      const vat = Math.round(mrr * VAT_RATE)
      const total = mrr + vat
      const issueDate = new Date().toISOString().slice(0, 10)
      const lineItems = [{
        description: `Monthly subscription — ${org.plan ?? 'plan'} (${period})`,
        qty: 1,
        unit_price_cents: mrr,
        total_cents: mrr,
      }]
      const zatcaQr = generateZATCAQRData({
        sellerName: 'ServIQ-FM',
        vatNumber: process.env.SERVIQ_VAT_NUMBER || '300000000000003',
        invoiceDate: new Date(issueDate).toISOString(),
        totalWithVAT: total / 100,
        vatAmount: vat / 100,
      })

      // Allocate the sequential number via the DB function, then insert. A 23505 on
      // the period index => already drafted this month (skip). On the invoice_number
      // index => number collision, retry once. ponytail: one retry; if a second run
      // races it, the pre-check + index still guarantee at most one per period.
      const insertDraft = async () => {
        const { data: num, error: numErr } = await admin.rpc('next_tenant_invoice_number', { org_id: org.id })
        if (numErr || !num) throw new Error(numErr?.message ?? 'Failed to allocate invoice number')
        return admin.from('tenant_invoices').insert({
          organisation_id: org.id,
          invoice_number: num as string,
          issue_date: issueDate,
          line_items: lineItems,
          subtotal_cents: mrr,
          vat_cents: vat,
          total_cents: total,
          status: 'draft',
          billing_period: period,
          zatca_qr: zatcaQr,
          notes: `Auto-drafted for ${period} (bank transfer).`,
        })
      }

      let res = await insertDraft()
      if (res.error?.code === '23505') {
        // Re-check: period dup => idempotent skip; otherwise a number collision, retry.
        const { data: dup } = await admin
          .from('tenant_invoices')
          .select('id')
          .eq('organisation_id', org.id)
          .eq('billing_period', period)
          .maybeSingle()
        if (dup) { skipped++; continue }
        res = await insertDraft()
      }
      if (res.error) { errors.push(`${org.id}: ${res.error.message}`); continue }
      drafted++
    } catch (e) {
      errors.push(`${org.id}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return { error: errors.length > 0 ? errors.join('; ') : null, period, drafted, skipped }
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 500 })
  }
  const authHeader = req.headers.get('authorization') ?? ''
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const result = await run()
    if (result.error) await captureAndAlert(new Error(result.error), { route: ROUTE })
    return NextResponse.json(result)
  } catch (e) {
    await captureAndAlert(e, { route: ROUTE })
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  return GET(req)
}
