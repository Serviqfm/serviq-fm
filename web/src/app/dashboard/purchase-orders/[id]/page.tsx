// web/src/app/dashboard/purchase-orders/[id]/page.tsx
// P2: lifecycle stepper, lines, send-to-vendor, requisition back-link.
// P3: per-line goods receipt — quantity, condition and bin location per line,
//     plus the receipt history those receipts produce.
//
// Every action button is cosmetic gating: /send, /status and /receive all
// re-check server-side, and receive_purchase_order_lines() owns the rules about
// what actually moves stock.
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

const CONDITIONS = ['ok', 'damaged', 'wrong_item', 'short'] as const
const CONDITION_LABEL: Record<string, { en: string; ar: string }> = {
  ok: { en: 'OK', ar: 'سليم' },
  damaged: { en: 'Damaged', ar: 'تالف' },
  wrong_item: { en: 'Wrong item', ar: 'صنف خاطئ' },
  short: { en: 'Short', ar: 'ناقص' },
}

type LineForm = { qty: string; condition: string; bin: string }

export default function PurchaseOrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { lang } = useLanguage()
  const isAr = lang === 'ar'
  const supabase = createClient()

  const [po, setPo] = useState<Row>(null)
  const [lines, setLines] = useState<Row[]>([])
  const [receipts, setReceipts] = useState<Row[]>([])
  // Pre-migration (no goods_receipts table) the page falls back to the stock
  // ledger and the all-or-nothing receive button — same philosophy as everywhere
  // else in this module.
  const [receiptsAvailable, setReceiptsAvailable] = useState(true)
  const [ledger, setLedger] = useState<Row[]>([])
  const [requisition, setRequisition] = useState<Row>(null)
  const [role, setRole] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [address, setAddress] = useState('')
  const [receiveOpen, setReceiveOpen] = useState(false)
  const [form, setForm] = useState<Record<string, LineForm>>({})

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

    const [pRes, lRes, sRes, grRes] = await Promise.all([
      supabase.from('purchase_orders')
        .select('*, vendor:vendor_id(id, company_name, email, payment_terms), site:site_id(name)')
        .eq('id', id).maybeSingle(),
      supabase.from('purchase_order_items').select('*, item:item_id(name, sku)').eq('purchase_order_id', id),
      supabase.from('stock_transactions')
        .select('*, item:item_id(name, sku)').eq('ref_po_id', id).order('created_at', { ascending: false }),
      supabase.from('goods_receipts')
        .select('*, receiver:received_by(full_name), lines:goods_receipt_lines(*)')
        .eq('purchase_order_id', id).order('received_at', { ascending: false }),
    ])
    if (pRes.error) setError(pRes.error.message)
    setPo(pRes.data)
    setAddress(pRes.data?.delivery_address ?? '')
    setLines(lRes.data ?? [])
    setLedger(sRes.data ?? [])
    setReceiptsAvailable(!grRes.error)
    setReceipts(grRes.data ?? [])

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

  async function receiveAll() {
    if (!confirm(isAr
      ? 'استلام كل الكميات المتبقية؟ سيتم تحديث المخزون وتسجيل قيد في دفتر الأستاذ.'
      : 'Receive every outstanding quantity? Stock will be incremented and ledger entries recorded.')) return
    await act('/receive', { method: 'POST' }, 'receiveAll')
  }

  async function receiveLines() {
    const payload = lines
      .map(l => ({ line: l, f: form[l.id] }))
      .filter(({ f }) => f && Number(f.qty) > 0)
      .map(({ line, f }) => ({
        purchase_order_item_id: line.id,
        qty_received: Number(f.qty),
        condition: f.condition || 'ok',
        bin_location: f.bin || null,
      }))
    if (payload.length === 0) {
      setError(isAr ? 'أدخل كمية واحدة على الأقل.' : 'Enter a quantity on at least one line.')
      return
    }
    const out = await act('/receive', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lines: payload }),
    }, 'receiveLines')
    if (out) {
      setForm({})
      setReceiveOpen(false)
      if (out.flagged > 0) {
        setNotice(isAr
          ? `تم التسجيل. ${out.flagged} بند(بنود) بها تباين — لم تُضف إلى المخزون.`
          : `Recorded. ${out.flagged} line(s) flagged — those quantities did not enter stock.`)
      }
    }
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

  // Cumulative ok quantity per PO line — the same rule the RPC uses to decide
  // whether the order is complete, so the screen and the DB always agree.
  const okByLine: Record<string, number> = {}
  let flaggedCount = 0
  for (const r of receipts) {
    for (const rl of r.lines ?? []) {
      if (rl.condition === 'ok') {
        okByLine[rl.purchase_order_item_id] = (okByLine[rl.purchase_order_item_id] ?? 0) + Number(rl.qty_received)
      } else {
        flaggedCount++
      }
    }
  }
  const outstanding = (l: Row) => Math.max(Number(l.quantity) - (okByLine[l.id] ?? 0), 0)

  const total = lines.reduce((s, l) => s + Number(l.quantity ?? 0) * Number(l.unit_cost ?? 0), 0)
  const isPrivileged = role === 'admin' || role === 'manager'
  const stepIndex = STEPS.indexOf(po.status)
  const isCancelled = po.status === 'cancelled'
  const canSend = isPrivileged && po.status === 'draft'
  const canReceive = isPrivileged && ['draft', 'sent', 'acknowledged', 'in_transit'].includes(po.status)

  const fieldCls = 'w-full bg-surface-container-low border border-outline-variant rounded-xl px-3 py-2 text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary'
  const label = (s: string) => (isAr ? STEP_LABEL[s]?.ar : STEP_LABEL[s]?.en) ?? s
  const condLabel = (c: string) => (isAr ? CONDITION_LABEL[c]?.ar : CONDITION_LABEL[c]?.en) ?? c

  return (
    <div className="star-pattern bg-surface min-h-screen p-8" dir={isAr ? 'rtl' : 'ltr'}>
      <div className="max-w-4xl mx-auto space-y-6">

        <div className="flex items-start gap-3">
          <Link href="/dashboard/purchase-orders" className="text-on-surface-variant hover:text-on-surface mt-1">
            <span className="material-symbols-outlined">{isAr ? 'arrow_forward' : 'arrow_back'}</span>
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-3xl font-bold text-on-surface">PO #{po.po_number}</h1>
              {flaggedCount > 0 && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-error/10 text-error border border-error/20">
                  <span className="material-symbols-outlined text-sm">report</span>
                  {flaggedCount} {isAr ? 'تباين' : 'flagged'}
                </span>
              )}
            </div>
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

        {/* Lines, with what has actually arrived against each */}
        <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="bg-surface-container-low border-b border-outline-variant/30">
                  {[
                    isAr ? 'البند' : 'Item',
                    isAr ? 'الكمية' : 'Qty',
                    isAr ? 'استُلم' : 'Received',
                    isAr ? 'سعر الوحدة' : 'Unit cost',
                    isAr ? 'الإجمالي' : 'Line total',
                  ].map(h => (
                    <th key={h} className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-on-surface-variant whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/20">
                {lines.map(l => {
                  const got = okByLine[l.id] ?? 0
                  return (
                    <tr key={l.id}>
                      <td className="px-4 py-3 text-sm text-on-surface">
                        {l.item?.name ?? l.description ?? '—'}
                        {l.item?.sku && <span className="text-on-surface-variant text-xs mx-2">{l.item.sku}</span>}
                      </td>
                      <td className="px-4 py-3 text-sm text-on-surface-variant">{Number(l.quantity)}</td>
                      <td className={`px-4 py-3 text-sm ${got >= Number(l.quantity) ? 'text-primary' : 'text-on-surface-variant'}`}>
                        {receiptsAvailable ? `${got} / ${Number(l.quantity)}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-on-surface-variant">{Number(l.unit_cost).toFixed(2)}</td>
                      <td className="px-4 py-3 text-sm text-on-surface-variant">
                        {(Number(l.quantity) * Number(l.unit_cost)).toFixed(2)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="bg-surface-container-low border-t border-outline-variant/30">
                  <td colSpan={4} className="px-4 py-3 text-sm font-semibold text-on-surface text-end">
                    {isAr ? 'الإجمالي' : 'Total'}
                  </td>
                  <td className="px-4 py-3 text-sm font-bold text-on-surface">
                    {total.toLocaleString('en-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} SAR
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Per-line receive */}
        {canReceive && receiptsAvailable && receiveOpen && (
          <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-6 space-y-4">
            <h2 className="text-sm font-semibold text-on-surface">
              {isAr ? 'تسجيل استلام' : 'Record a delivery'}
            </h2>
            <p className="text-xs text-on-surface-variant">
              {isAr
                ? 'الكميات السليمة فقط تدخل المخزون. التالف أو الخاطئ يُسجَّل ولا يُضاف.'
                : 'Only OK quantities enter stock. Damaged, wrong or short quantities are recorded but never added.'}
            </p>

            {lines.map(l => {
              const left = outstanding(l)
              const f = form[l.id] ?? { qty: '', condition: 'ok', bin: '' }
              const set = (k: keyof LineForm, v: string) =>
                setForm(prev => ({ ...prev, [l.id]: { ...f, [k]: v } }))
              return (
                <div key={l.id} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end border-b border-outline-variant/30 pb-4 last:border-0 last:pb-0">
                  <div className="sm:col-span-5">
                    <div className="text-sm text-on-surface">{l.item?.name ?? l.description ?? '—'}</div>
                    <div className="text-xs text-on-surface-variant mt-0.5">
                      {isAr ? 'المتبقي' : 'Outstanding'}: {left} / {Number(l.quantity)}
                    </div>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">{isAr ? 'الكمية' : 'Qty'}</label>
                    <input type="number" min="0" step="any" value={f.qty}
                      onChange={e => set('qty', e.target.value)} className={fieldCls} placeholder={String(left)} />
                  </div>
                  <div className="sm:col-span-3">
                    <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">{isAr ? 'الحالة' : 'Condition'}</label>
                    <select value={f.condition} onChange={e => set('condition', e.target.value)} className={fieldCls}>
                      {CONDITIONS.map(c => <option key={c} value={c}>{condLabel(c)}</option>)}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">{isAr ? 'الموقع' : 'Bin'}</label>
                    <input value={f.bin} onChange={e => set('bin', e.target.value)} className={fieldCls} placeholder="A-01" />
                  </div>
                </div>
              )
            })}

            <div className="flex flex-wrap gap-3 pt-2">
              <button onClick={receiveLines} disabled={busy !== ''}
                className="bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm disabled:opacity-50">
                {busy === 'receiveLines' ? '…' : (isAr ? 'تسجيل الاستلام' : 'Record receipt')}
              </button>
              <button onClick={() => { setReceiveOpen(false); setForm({}) }}
                className="px-5 py-2.5 rounded-xl border border-outline-variant text-on-surface-variant text-sm font-semibold hover:bg-surface-container-low transition-colors">
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
            </div>
          </div>
        )}

        {/* Receipt history */}
        <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-6">
          <h2 className="text-sm font-semibold text-on-surface mb-3">
            {isAr ? 'سجل الاستلام' : 'Receipt history'}
          </h2>
          {receiptsAvailable ? (
            receipts.length === 0 ? (
              <p className="text-sm text-on-surface-variant">{isAr ? 'لم يُستلم شيء بعد.' : 'Nothing received yet.'}</p>
            ) : (
              <ul className="space-y-4">
                {receipts.map(r => (
                  <li key={r.id} className="border-b border-outline-variant/30 pb-4 last:border-0 last:pb-0">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="material-symbols-outlined text-primary text-base">local_shipping</span>
                      <span className="font-semibold text-on-surface">GR #{r.receipt_number}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        r.status === 'full' ? 'bg-primary/10 text-primary' : 'bg-secondary/10 text-secondary'
                      }`}>
                        {r.status === 'full' ? (isAr ? 'كامل' : 'Full') : (isAr ? 'جزئي' : 'Partial')}
                      </span>
                      <span className="text-outline text-xs ms-auto">
                        {r.receiver?.full_name ? `${r.receiver.full_name} · ` : ''}
                        {new Date(r.received_at).toLocaleString()}
                      </span>
                    </div>
                    <ul className="mt-2 space-y-1 ps-6">
                      {(r.lines ?? []).map((rl: Row) => (
                        <li key={rl.id} className="text-sm flex items-center gap-2 flex-wrap">
                          <span className="text-on-surface-variant">
                            {lines.find(l => l.id === rl.purchase_order_item_id)?.item?.name
                              ?? lines.find(l => l.id === rl.purchase_order_item_id)?.description
                              ?? '—'}
                          </span>
                          <span className="text-on-surface">×{Number(rl.qty_received)}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            rl.condition === 'ok' ? 'bg-primary/10 text-primary' : 'bg-error/10 text-error'
                          }`}>
                            {condLabel(rl.condition)}
                          </span>
                          {rl.bin_location && (
                            <span className="text-outline text-xs">{isAr ? 'الموقع' : 'Bin'} {rl.bin_location}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )
          ) : ledger.length === 0 ? (
            <p className="text-sm text-on-surface-variant">{isAr ? 'لم يُستلم شيء بعد.' : 'Nothing received yet.'}</p>
          ) : (
            // Pre-migration fallback: the stock ledger is the only receipt record.
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
            {canReceive && receiptsAvailable && !receiveOpen && (
              <button onClick={() => setReceiveOpen(true)}
                className="px-5 py-2.5 rounded-xl bg-primary/10 text-primary text-sm font-semibold hover:bg-primary/20 transition-colors">
                {isAr ? 'تسجيل استلام' : 'Record a delivery'}
              </button>
            )}
            {canReceive && (
              <button onClick={receiveAll} disabled={busy !== ''}
                className="px-5 py-2.5 rounded-xl border border-outline-variant text-on-surface-variant text-sm font-semibold hover:bg-surface-container-low disabled:opacity-50 transition-colors">
                {busy === 'receiveAll' ? '…' : (isAr ? 'استلام الكل' : 'Receive all')}
              </button>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
