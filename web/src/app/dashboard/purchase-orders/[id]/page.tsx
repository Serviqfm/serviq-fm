// web/src/app/dashboard/purchase-orders/[id]/page.tsx
// P2: PO detail — lifecycle stepper, lines, send-to-vendor, the requisition it
// came from, and the receipt ledger. Until now Purchase Orders was list-only.
//
// Every action button is cosmetic gating: /send, /status and /receive all
// re-check server-side, and /status owns the forward-only rule.
'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { useLanguage } from '@/context/LanguageContext'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any

const STEPS = ['draft', 'sent', 'acknowledged', 'in_transit', 'received'] as const
const STEP_LABEL: Record<string, { en: string; ar: string }> = {
  draft: { en: 'Draft', ar: 'مسودة' },
  sent: { en: 'Sent', ar: 'أُرسل' },
  acknowledged: { en: 'Acknowledged', ar: 'تم الإقرار' },
  in_transit: { en: 'In transit', ar: 'قيد الشحن' },
  received: { en: 'Received', ar: 'تم الاستلام' },
  cancelled: { en: 'Cancelled', ar: 'ملغي' },
}

export default function PurchaseOrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { lang } = useLanguage()
  const isAr = lang === 'ar'
  const supabase = createClient()

  const [po, setPo] = useState<Row>(null)
  const [lines, setLines] = useState<Row[]>([])
  const [ledger, setLedger] = useState<Row[]>([])
  const [requisition, setRequisition] = useState<Row>(null)
  const [role, setRole] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [address, setAddress] = useState('')

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [id])

  async function load() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data: profile } = await supabase
      .from('users').select('role, organisation_id').eq('id', user.id).single()
    if (!profile) { setLoading(false); return }
    setRole(profile.role ?? '')

    const [pRes, lRes, sRes] = await Promise.all([
      supabase.from('purchase_orders')
        .select('*, vendor:vendor_id(id, company_name, email, payment_terms), site:site_id(name)')
        .eq('id', id).maybeSingle(),
      supabase.from('purchase_order_items').select('*, item:item_id(name, sku)').eq('purchase_order_id', id),
      supabase.from('stock_transactions')
        .select('*, item:item_id(name, sku)').eq('ref_po_id', id).order('created_at', { ascending: false }),
    ])
    if (pRes.error) setError(pRes.error.message)
    setPo(pRes.data)
    setAddress(pRes.data?.delivery_address ?? '')
    setLines(lRes.data ?? [])
    setLedger(sRes.data ?? [])

    // Separate + tolerant: a tenant that hasn't run the P1 migration has no
    // requisitions table, and that must not break this page.
    const { data: req } = await supabase
      .from('requisitions').select('id, requisition_number, title').eq('purchase_order_id', id).maybeSingle()
    setRequisition(req ?? null)
    setLoading(false)
  }

  async function act(path: string, init: RequestInit, key: string) {
    setError(''); setNotice(''); setBusy(key)
    const res = await fetch(`/api/purchase-orders/${id}${path}`, init)
    setBusy('')
    const body = await res.json().catch(() => ({}))
    if (!res.ok) { setError(body.error || (isAr ? 'فشل الإجراء' : 'Action failed')); return null }
    await load()
    return body
  }

  const json = (b: unknown): RequestInit => ({
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b),
  })

  async function send() {
    if (!confirm(isAr
      ? 'إرسال أمر الشراء إلى المورد بالبريد الإلكتروني؟'
      : 'Email this purchase order to the vendor?')) return
    const out = await act('/send', { method: 'POST' }, 'send')
    if (out?.sent_to) setNotice((isAr ? 'أُرسل إلى ' : 'Sent to ') + out.sent_to)
  }
  const advance = (status: string) => act('/status', json({ status }), status)
  const saveAddress = () => act('', json({ delivery_address: address || null }), 'address')
  async function receive() {
    if (!confirm(isAr
      ? 'استلام أمر الشراء؟ سيتم تحديث المخزون وتسجيل قيد في دفتر الأستاذ.'
      : 'Receive this purchase order? Stock will be incremented and a ledger entry recorded.')) return
    await act('/receive', { method: 'POST' }, 'receive')
  }

  if (loading) return <div className="p-8 text-on-surface-variant">{isAr ? 'جارٍ التحميل…' : 'Loading…'}</div>
  if (!po) return (
    <div className="p-8">
      <p className="text-on-surface-variant">{isAr ? 'أمر الشراء غير موجود.' : 'Purchase order not found.'}</p>
      <Link href="/dashboard/purchase-orders" className="text-primary text-sm font-semibold hover:underline">
        {isAr ? 'العودة إلى القائمة' : 'Back to the list'}
      </Link>
    </div>
  )

  const total = lines.reduce((s, l) => s + Number(l.quantity ?? 0) * Number(l.unit_cost ?? 0), 0)
  const isPrivileged = role === 'admin' || role === 'manager'
  const stepIndex = STEPS.indexOf(po.status)
  const isCancelled = po.status === 'cancelled'
  const canSend = isPrivileged && po.status === 'draft'
  const canReceive = isPrivileged && ['draft', 'sent', 'acknowledged', 'in_transit'].includes(po.status)

  const fieldCls = 'w-full bg-surface-container-low border border-outline-variant rounded-xl px-3 py-2 text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary'
  const label = (s: string) => (isAr ? STEP_LABEL[s]?.ar : STEP_LABEL[s]?.en) ?? s

  return (
    <div className="star-pattern bg-surface min-h-screen p-8" dir={isAr ? 'rtl' : 'ltr'}>
      <div className="max-w-4xl mx-auto space-y-6">

        <div className="flex items-start gap-3">
          <Link href="/dashboard/purchase-orders" className="text-on-surface-variant hover:text-on-surface mt-1">
            <span className="material-symbols-outlined">{isAr ? 'arrow_forward' : 'arrow_back'}</span>
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-3xl font-bold text-on-surface">PO #{po.po_number}</h1>
            <p className="text-on-surface-variant text-sm mt-1">{po.vendor?.company_name ?? '—'}</p>
          </div>
        </div>

        {error && <div className="bg-error/10 border border-error/20 rounded-lg px-3 py-2 text-error text-sm">{error}</div>}
        {notice && <div className="bg-primary/10 border border-primary/20 rounded-lg px-3 py-2 text-primary text-sm">{notice}</div>}

        {/* Lifecycle stepper */}
        <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-6">
          {isCancelled ? (
            <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold bg-error/10 text-error border border-error/20">
              {label('cancelled')}
            </span>
          ) : (
            <div className="flex items-center gap-1 flex-wrap">
              {STEPS.map((s, i) => (
                <div key={s} className="flex items-center gap-1">
                  <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                    i < stepIndex ? 'bg-primary/10 text-primary'
                    : i === stepIndex ? 'bg-primary text-on-primary'
                    : 'bg-surface-container-low text-on-surface-variant'
                  }`}>
                    <span className="material-symbols-outlined text-sm">
                      {i < stepIndex ? 'check_circle' : i === stepIndex ? 'radio_button_checked' : 'radio_button_unchecked'}
                    </span>
                    {label(s)}
                  </div>
                  {i < STEPS.length - 1 && <span className="w-4 h-px bg-outline-variant" />}
                </div>
              ))}
            </div>
          )}
        </div>

        {requisition && (
          <div className="bg-primary/5 border border-primary/20 rounded-[12px] p-4 text-sm flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">edit_note</span>
            <span className="text-on-surface-variant">{isAr ? 'أُنشئ من طلب الشراء' : 'Created from requisition'}</span>
            <Link href={`/dashboard/procurement/requisitions/${requisition.id}`} className="text-primary font-semibold hover:underline">
              REQ #{requisition.requisition_number} · {requisition.title}
            </Link>
          </div>
        )}

        {/* Meta */}
        <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-6 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          {[
            { k: isAr ? 'المورد' : 'Vendor', v: po.vendor?.company_name ?? '—' },
            { k: isAr ? 'شروط الدفع' : 'Payment terms', v: po.vendor?.payment_terms ?? '—' },
            { k: isAr ? 'الموقع' : 'Site', v: po.site?.name ?? '—' },
            { k: isAr ? 'متوقع بحلول' : 'Expected by', v: po.expected_at ?? '—' },
            { k: isAr ? 'أُرسل في' : 'Sent at', v: po.sent_at ? new Date(po.sent_at).toLocaleString() : '—' },
            { k: isAr ? 'أُرسل إلى' : 'Sent to', v: po.vendor_email_snapshot ?? '—' },
            { k: isAr ? 'استُلم في' : 'Received at', v: po.received_at ? new Date(po.received_at).toLocaleString() : '—' },
          ].map(f => (
            <div key={f.k}>
              <div className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-1">{f.k}</div>
              <div className="text-on-surface break-words">{f.v}</div>
            </div>
          ))}
        </div>

        {/* Delivery address — editable while draft, since it lands on the vendor's PDF */}
        <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-6">
          <div className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-2">
            {isAr ? 'عنوان التسليم' : 'Delivery address'}
          </div>
          {canSend ? (
            <div className="flex gap-3 items-start">
              <textarea value={address} onChange={e => setAddress(e.target.value)} rows={2} className={fieldCls}
                placeholder={isAr ? 'يظهر في ملف PDF المرسل للمورد' : 'Appears on the PDF the vendor receives'} />
              <button onClick={saveAddress} disabled={busy !== ''}
                className="px-4 py-2 rounded-xl border border-outline-variant text-on-surface-variant text-sm font-semibold hover:bg-surface-container-low disabled:opacity-50 transition-colors flex-shrink-0">
                {busy === 'address' ? '…' : (isAr ? 'حفظ' : 'Save')}
              </button>
            </div>
          ) : (
            <p className="text-sm text-on-surface whitespace-pre-wrap">{po.delivery_address ?? po.site?.name ?? '—'}</p>
          )}
        </div>

        {/* Lines */}
        <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm overflow-hidden">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-surface-container-low border-b border-outline-variant/30">
                {[
                  isAr ? 'البند' : 'Item',
                  isAr ? 'الكمية' : 'Qty',
                  isAr ? 'سعر الوحدة' : 'Unit cost',
                  isAr ? 'الإجمالي' : 'Line total',
                ].map(h => (
                  <th key={h} className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/20">
              {lines.map(l => (
                <tr key={l.id}>
                  <td className="px-4 py-3 text-sm text-on-surface">
                    {l.item?.name ?? l.description ?? '—'}
                    {l.item?.sku && <span className="text-on-surface-variant text-xs mx-2">{l.item.sku}</span>}
                  </td>
                  <td className="px-4 py-3 text-sm text-on-surface-variant">{Number(l.quantity)}</td>
                  <td className="px-4 py-3 text-sm text-on-surface-variant">{Number(l.unit_cost).toFixed(2)}</td>
                  <td className="px-4 py-3 text-sm text-on-surface-variant">
                    {(Number(l.quantity) * Number(l.unit_cost)).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-surface-container-low border-t border-outline-variant/30">
                <td colSpan={3} className="px-4 py-3 text-sm font-semibold text-on-surface text-end">
                  {isAr ? 'الإجمالي' : 'Total'}
                </td>
                <td className="px-4 py-3 text-sm font-bold text-on-surface">
                  {total.toLocaleString('en-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} SAR
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Receipt history — the stock ledger is the receipt record we have in V1.
            P3 replaces this with per-line goods receipts. */}
        <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-6">
          <h2 className="text-sm font-semibold text-on-surface mb-3">
            {isAr ? 'سجل الاستلام' : 'Receipt history'}
          </h2>
          {ledger.length === 0 ? (
            <p className="text-sm text-on-surface-variant">
              {isAr ? 'لم يُستلم شيء بعد.' : 'Nothing received yet.'}
            </p>
          ) : (
            <ul className="space-y-2">
              {ledger.map(t => (
                <li key={t.id} className="flex items-center gap-2 text-sm">
                  <span className="material-symbols-outlined text-primary text-base">inventory</span>
                  <span className="text-on-surface">{t.item?.name ?? '—'}</span>
                  <span className="text-on-surface-variant">+{Number(t.delta)}</span>
                  <span className="text-outline text-xs ms-auto">{new Date(t.created_at).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Actions */}
        {isPrivileged && !isCancelled && po.status !== 'received' && (
          <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-6 flex flex-wrap gap-3">
            {canSend && (
              <button onClick={send} disabled={busy !== ''}
                className="bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm disabled:opacity-50 flex items-center gap-2">
                <span className="material-symbols-outlined text-lg">send</span>
                {busy === 'send' ? '…' : (isAr ? 'إرسال إلى المورد' : 'Send to vendor')}
              </button>
            )}
            {po.status === 'sent' && (
              <button onClick={() => advance('acknowledged')} disabled={busy !== ''}
                className="px-5 py-2.5 rounded-xl border border-outline-variant text-on-surface-variant text-sm font-semibold hover:bg-surface-container-low disabled:opacity-50 transition-colors">
                {busy === 'acknowledged' ? '…' : (isAr ? 'تسجيل إقرار المورد' : 'Mark acknowledged')}
              </button>
            )}
            {['sent', 'acknowledged'].includes(po.status) && (
              <button onClick={() => advance('in_transit')} disabled={busy !== ''}
                className="px-5 py-2.5 rounded-xl border border-outline-variant text-on-surface-variant text-sm font-semibold hover:bg-surface-container-low disabled:opacity-50 transition-colors">
                {busy === 'in_transit' ? '…' : (isAr ? 'تسجيل قيد الشحن' : 'Mark in transit')}
              </button>
            )}
            {canReceive && (
              <button onClick={receive} disabled={busy !== ''}
                className="px-5 py-2.5 rounded-xl bg-primary/10 text-primary text-sm font-semibold hover:bg-primary/20 disabled:opacity-50 transition-colors">
                {busy === 'receive' ? '…' : (isAr ? 'استلام' : 'Receive')}
              </button>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
