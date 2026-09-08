// web/src/app/dashboard/vendors/[id]/invoices/[invoiceId]/page.tsx
// P4: vendor-invoice detail — link the invoice to a purchase order, record what
// it billed, run the 3-way match, and act on the verdict.
//
// The buttons here are cosmetic gating only: /match, PATCH and the status route
// all re-check server-side, and the match itself is computed by the pure matcher
// (lib/threeWayMatch.ts), never in this file.
'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { useLanguage } from '@/context/LanguageContext'
import type { MatchResult, Check, Issue } from '@/lib/threeWayMatch'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any
type LineForm = { po_item_id: string; description: string; quantity: string; unit_price: string }

const EMPTY_LINE: LineForm = { po_item_id: '', description: '', quantity: '1', unit_price: '' }

const CHECK_LABEL: Record<string, { en: string; ar: string }> = {
  po_invoice: { en: 'Purchase order ↔ Invoice', ar: 'أمر الشراء ↔ الفاتورة' },
  gr_invoice: { en: 'Goods receipt ↔ Invoice', ar: 'الاستلام ↔ الفاتورة' },
  totals: { en: 'Invoice total ↔ Lines', ar: 'إجمالي الفاتورة ↔ البنود' },
}
const MATCH_CLS: Record<string, string> = {
  unmatched: 'bg-outline-variant/20 text-on-surface-variant border border-outline-variant/30',
  matched: 'bg-primary/10 text-primary border border-primary/20',
  mismatch: 'bg-error/10 text-error border border-error/20',
  approved_for_payment: 'bg-primary/10 text-primary border border-primary/20',
  disputed: 'bg-error/10 text-error border border-error/20',
}
const MATCH_LABEL: Record<string, { en: string; ar: string }> = {
  unmatched: { en: 'Not matched', ar: 'غير مطابقة' },
  matched: { en: 'Matched', ar: 'مطابقة' },
  mismatch: { en: 'Mismatch', ar: 'عدم تطابق' },
  approved_for_payment: { en: 'Approved for payment', ar: 'معتمدة للدفع' },
  disputed: { en: 'Disputed', ar: 'متنازع عليها' },
}
const ISSUE_KIND: Record<string, { en: string; ar: string }> = {
  price: { en: 'Unit price', ar: 'سعر الوحدة' },
  quantity: { en: 'Quantity', ar: 'الكمية' },
  total: { en: 'Total', ar: 'الإجمالي' },
  unlinked: { en: 'Not on the order', ar: 'غير مدرج في الأمر' },
}

export default function VendorInvoiceDetailPage() {
  const { id: vendorId, invoiceId } = useParams<{ id: string; invoiceId: string }>()
  const { lang } = useLanguage()
  const isAr = lang === 'ar'
  const supabase = createClient()

  const [invoice, setInvoice] = useState<Row>(null)
  const [pos, setPos] = useState<Row[]>([])
  const [poLines, setPoLines] = useState<Row[]>([])
  const [lines, setLines] = useState<LineForm[]>([])
  const [role, setRole] = useState('')
  const [available, setAvailable] = useState(true)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [poId, setPoId] = useState('')

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [invoiceId])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (poId) loadPoLines(poId); else setPoLines([]) }, [poId])

  async function load() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data: profile } = await supabase
      .from('users').select('role, organisation_id').eq('id', user.id).single()
    if (!profile) { setLoading(false); return }
    setRole(profile.role ?? '')

    const { data: inv, error: invErr } = await supabase
      .from('vendor_invoices').select('*').eq('id', invoiceId).maybeSingle()
    // Pre-migration the match columns don't exist; the select still succeeds, so
    // detect the feature by the column's presence rather than by an error.
    if (inv && !('match_status' in inv)) setAvailable(false)
    if (invErr) setError(invErr.message)
    setInvoice(inv)
    setPoId(inv?.purchase_order_id ?? '')

    const [poRes, lineRes] = await Promise.all([
      supabase.from('purchase_orders')
        .select('id, po_number, status').eq('vendor_id', vendorId).order('created_at', { ascending: false }),
      supabase.from('vendor_invoice_lines')
        .select('*').eq('vendor_invoice_id', invoiceId).order('created_at'),
    ])
    setPos(poRes.data ?? [])
    if (lineRes.error) setAvailable(false)
    setLines((lineRes.data ?? []).map(l => ({
      po_item_id: l.purchase_order_item_id ?? '',
      description: l.description ?? '',
      quantity: String(l.quantity ?? ''),
      unit_price: String(l.unit_price ?? ''),
    })))
    setLoading(false)
  }

  async function loadPoLines(id: string) {
    const { data } = await supabase
      .from('purchase_order_items')
      .select('id, description, quantity, unit_cost, item:item_id(name, sku)')
      .eq('purchase_order_id', id)
    setPoLines(data ?? [])
  }

  async function call(path: string, init: RequestInit, key: string) {
    setError(''); setBusy(key)
    const res = await fetch(`/api/vendor-invoices/${invoiceId}${path}`, init)
    setBusy('')
    const body = await res.json().catch(() => ({}))
    if (!res.ok) { setError(body.error || (isAr ? 'فشل الإجراء' : 'Action failed')); return null }
    await load()
    return body
  }

  const savePo = () => call('', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ purchase_order_id: poId || null }),
  }, 'po')

  const saveLines = () => call('', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      lines: lines
        .filter(l => Number(l.quantity) > 0)
        .map(l => ({
          purchase_order_item_id: l.po_item_id || null,
          description: l.description || null,
          quantity: Number(l.quantity),
          unit_price: Number(l.unit_price || 0),
        })),
    }),
  }, 'lines')

  const runMatch = () => call('/match', { method: 'POST' }, 'match')

  const decide = (match_status: string) => call('/status', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ match_status }),
  }, match_status)

  function prefillFromPo() {
    setLines(poLines.map(l => ({
      po_item_id: l.id,
      description: l.item?.name ?? l.description ?? '',
      quantity: String(Number(l.quantity)),
      unit_price: String(Number(l.unit_cost)),
    })))
  }

  if (loading) return <div className="p-8 text-on-surface-variant">{isAr ? 'جارٍ التحميل…' : 'Loading…'}</div>
  if (!invoice) return (
    <div className="p-8">
      <p className="text-on-surface-variant">{isAr ? 'الفاتورة غير موجودة.' : 'Invoice not found.'}</p>
      <Link href={`/dashboard/vendors/${vendorId}`} className="text-primary text-sm font-semibold hover:underline">
        {isAr ? 'العودة إلى المورد' : 'Back to the vendor'}
      </Link>
    </div>
  )

  const isPrivileged = role === 'admin' || role === 'manager'
  const match: MatchResult | null = invoice.match_detail ?? null
  const matchStatus: string = invoice.match_status ?? 'unmatched'
  const lineSum = lines.reduce((s, l) => s + Number(l.quantity || 0) * Number(l.unit_price || 0), 0)

  const fieldCls = 'w-full bg-surface-container-low border border-outline-variant rounded-xl px-3 py-2 text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary'
  const labelCls = 'block text-xs font-semibold text-on-surface-variant mb-1.5'
  const t = (m: Record<string, { en: string; ar: string }>, k: string) => (isAr ? m[k]?.ar : m[k]?.en) ?? k

  return (
    <div className="star-pattern bg-surface min-h-screen p-8" dir={isAr ? 'rtl' : 'ltr'}>
      <div className="max-w-4xl mx-auto space-y-6">

        <div className="flex items-start gap-3">
          <Link href={`/dashboard/vendors/${vendorId}`} className="text-on-surface-variant hover:text-on-surface mt-1">
            <span className="material-symbols-outlined">{isAr ? 'arrow_forward' : 'arrow_back'}</span>
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-3xl font-bold text-on-surface">{invoice.invoice_number}</h1>
              <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize bg-surface-container-low text-on-surface-variant border border-outline-variant">
                {invoice.status}
              </span>
              {available && (
                <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${MATCH_CLS[matchStatus] ?? ''}`}>
                  {t(MATCH_LABEL, matchStatus)}
                </span>
              )}
            </div>
            <p className="text-on-surface-variant text-sm mt-1">
              {Number(invoice.amount).toLocaleString('en-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} SAR
              {invoice.invoice_date && ` · ${invoice.invoice_date}`}
            </p>
          </div>
        </div>

        {error && <div className="bg-error/10 border border-error/20 rounded-lg px-3 py-2 text-error text-sm">{error}</div>}

        {!available && (
          <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] p-6 text-sm text-on-surface-variant">
            {isAr
              ? 'المطابقة الثلاثية غير متاحة — لم يتم تشغيل ملف الترحيل procurement-05-three-way.sql بعد.'
              : 'Three-way matching is unavailable — procurement-05-three-way.sql has not been run yet.'}
          </div>
        )}

        {available && isPrivileged && (
          <>
            {/* Which order is this invoice for */}
            <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-6">
              <label className={labelCls}>{isAr ? 'أمر الشراء' : 'Purchase order'}</label>
              <div className="flex gap-3 items-start">
                <select value={poId} onChange={e => setPoId(e.target.value)} className={fieldCls}>
                  <option value="">{isAr ? '— غير مرتبطة —' : '— Not linked —'}</option>
                  {pos.map(p => (
                    <option key={p.id} value={p.id}>PO #{p.po_number} · {p.status}</option>
                  ))}
                </select>
                <button onClick={savePo} disabled={busy !== ''}
                  className="px-4 py-2 rounded-xl border border-outline-variant text-on-surface-variant text-sm font-semibold hover:bg-surface-container-low disabled:opacity-50 transition-colors flex-shrink-0">
                  {busy === 'po' ? '…' : (isAr ? 'حفظ' : 'Save')}
                </button>
              </div>
              <p className="text-xs text-on-surface-variant mt-2">
                {isAr
                  ? 'تغيير أمر الشراء يمسح نتيجة المطابقة السابقة.'
                  : 'Changing the order clears any previously recorded match.'}
              </p>
            </div>

            {/* What the vendor billed */}
            <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-6 space-y-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <h2 className="text-sm font-semibold text-on-surface">
                  {isAr ? 'بنود الفاتورة' : 'Invoice lines'}
                </h2>
                <div className="flex gap-3">
                  {poLines.length > 0 && (
                    <button onClick={prefillFromPo} type="button"
                      className="text-primary text-sm font-semibold hover:underline">
                      {isAr ? 'تعبئة من أمر الشراء' : 'Prefill from the order'}
                    </button>
                  )}
                  <button onClick={() => setLines(prev => [...prev, { ...EMPTY_LINE }])} type="button"
                    className="text-primary text-sm font-semibold hover:underline flex items-center gap-1">
                    <span className="material-symbols-outlined text-base">add</span>
                    {isAr ? 'إضافة بند' : 'Add line'}
                  </button>
                </div>
              </div>

              {lines.length === 0 && (
                <p className="text-sm text-on-surface-variant">
                  {isAr
                    ? 'لا توجد بنود بعد — أضفها لتتمكن من المطابقة على مستوى الكمية والسعر.'
                    : 'No lines yet — add them so the match can compare quantities and prices.'}
                </p>
              )}

              {lines.map((l, idx) => {
                const set = (k: keyof LineForm, v: string) =>
                  setLines(prev => prev.map((x, i) => i === idx ? { ...x, [k]: v } : x))
                return (
                  <div key={idx} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end border-b border-outline-variant/30 pb-4 last:border-0 last:pb-0">
                    <div className="sm:col-span-4">
                      <label className={labelCls}>{isAr ? 'بند أمر الشراء' : 'Order line'}</label>
                      <select value={l.po_item_id} onChange={e => set('po_item_id', e.target.value)} className={fieldCls}>
                        <option value="">{isAr ? '— غير مرتبط —' : '— Not on the order —'}</option>
                        {poLines.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.item?.name ?? p.description ?? 'Line'} · {Number(p.quantity)} × {Number(p.unit_cost)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="sm:col-span-4">
                      <label className={labelCls}>{isAr ? 'الوصف' : 'Description'}</label>
                      <input value={l.description} onChange={e => set('description', e.target.value)} className={fieldCls} />
                    </div>
                    <div className="sm:col-span-1">
                      <label className={labelCls}>{isAr ? 'الكمية' : 'Qty'}</label>
                      <input type="number" min="0" step="any" value={l.quantity}
                        onChange={e => set('quantity', e.target.value)} className={fieldCls} />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelCls}>{isAr ? 'سعر الوحدة' : 'Unit price'}</label>
                      <input type="number" min="0" step="any" value={l.unit_price}
                        onChange={e => set('unit_price', e.target.value)} className={fieldCls} />
                    </div>
                    <div className="sm:col-span-1 flex justify-end">
                      <button type="button" onClick={() => setLines(prev => prev.filter((_, i) => i !== idx))}
                        className="p-2 rounded-lg text-on-surface-variant hover:text-error hover:bg-error/5 transition-colors">
                        <span className="material-symbols-outlined text-lg">delete</span>
                      </button>
                    </div>
                  </div>
                )
              })}

              <div className="flex items-center justify-between pt-2">
                <span className="text-sm text-on-surface-variant">
                  {isAr ? 'مجموع البنود' : 'Lines total'}:{' '}
                  <strong className={Math.abs(lineSum - Number(invoice.amount)) > 0.005 ? 'text-error' : 'text-on-surface'}>
                    {lineSum.toLocaleString('en-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </strong>
                  {' / '}
                  {Number(invoice.amount).toLocaleString('en-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} SAR
                </span>
                <button onClick={saveLines} disabled={busy !== ''}
                  className="px-4 py-2 rounded-xl border border-outline-variant text-on-surface-variant text-sm font-semibold hover:bg-surface-container-low disabled:opacity-50 transition-colors">
                  {busy === 'lines' ? '…' : (isAr ? 'حفظ البنود' : 'Save lines')}
                </button>
              </div>
            </div>

            {/* The match */}
            <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-6 space-y-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <h2 className="text-sm font-semibold text-on-surface">
                  {isAr ? 'المطابقة الثلاثية' : 'Three-way match'}
                </h2>
                <button onClick={runMatch} disabled={busy !== '' || !invoice.purchase_order_id}
                  title={!invoice.purchase_order_id ? (isAr ? 'اربط أمر شراء أولاً' : 'Link a purchase order first') : undefined}
                  className="bg-primary text-on-primary px-5 py-2 rounded-xl font-semibold text-sm disabled:opacity-50">
                  {busy === 'match' ? '…' : (isAr ? 'تشغيل المطابقة' : 'Run match')}
                </button>
              </div>

              {!match ? (
                <p className="text-sm text-on-surface-variant">
                  {isAr ? 'لم تُشغَّل المطابقة بعد.' : 'The match has not been run yet.'}
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {match.checks.map((c: Check) => (
                      <div key={c.key} className={`rounded-[12px] border p-3 ${
                        c.pass ? 'border-primary/30 bg-primary/5' : 'border-error/30 bg-error/5'}`}>
                        <div className="flex items-center gap-2">
                          <span className={`material-symbols-outlined text-lg ${c.pass ? 'text-primary' : 'text-error'}`}>
                            {c.pass ? 'check_circle' : 'cancel'}
                          </span>
                          <span className="text-xs font-semibold text-on-surface">{t(CHECK_LABEL, c.key)}</span>
                        </div>
                        {!c.pass && (
                          <p className="text-xs text-error mt-1">
                            {c.issues.length} {isAr ? 'مشكلة' : c.issues.length === 1 ? 'issue' : 'issues'}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>

                  {match.issueCount > 0 && (
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse text-left">
                        <thead>
                          <tr className="bg-surface-container-low border-b border-outline-variant/30">
                            {[
                              isAr ? 'البند' : 'Line',
                              isAr ? 'النوع' : 'What',
                              isAr ? 'المتوقع' : 'Expected',
                              isAr ? 'المفوتر' : 'Invoiced',
                              isAr ? 'الفرق' : 'Delta',
                            ].map(h => (
                              <th key={h} className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-on-surface-variant whitespace-nowrap">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-outline-variant/20">
                          {match.checks.flatMap((c: Check) =>
                            c.issues.map((i: Issue, n: number) => (
                              <tr key={`${c.key}-${n}`}>
                                <td className="px-3 py-2 text-sm text-on-surface">{i.label}</td>
                                <td className="px-3 py-2 text-sm text-on-surface-variant">{t(ISSUE_KIND, i.kind)}</td>
                                <td className="px-3 py-2 text-sm text-on-surface-variant">{i.expected}</td>
                                <td className="px-3 py-2 text-sm text-on-surface-variant">{i.actual}</td>
                                <td className={`px-3 py-2 text-sm font-semibold ${i.delta > 0 ? 'text-error' : 'text-on-surface-variant'}`}>
                                  {i.delta > 0 ? '+' : ''}{i.delta}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {match.matchedAt && (
                    <p className="text-xs text-outline">
                      {isAr ? 'آخر مطابقة' : 'Last matched'}: {new Date(match.matchedAt).toLocaleString()}
                    </p>
                  )}
                </>
              )}

              <div className="flex flex-wrap gap-3 border-t border-outline-variant/30 pt-4">
                <button onClick={() => decide('approved_for_payment')}
                  disabled={busy !== '' || matchStatus !== 'matched'}
                  title={matchStatus !== 'matched'
                    ? (isAr ? 'لا يمكن الاعتماد إلا بعد مطابقة ناجحة' : 'Only a matched invoice can be approved')
                    : undefined}
                  className="bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm disabled:opacity-50">
                  {busy === 'approved_for_payment' ? '…' : (isAr ? 'اعتماد للدفع' : 'Approve for payment')}
                </button>
                <button onClick={() => decide('disputed')}
                  disabled={busy !== '' || matchStatus === 'disputed'}
                  className="px-5 py-2.5 rounded-xl border border-error/40 text-error text-sm font-semibold hover:bg-error/5 disabled:opacity-50 transition-colors">
                  {busy === 'disputed' ? '…' : (isAr ? 'تنازع' : 'Dispute')}
                </button>
              </div>
            </div>
          </>
        )}

        {available && !isPrivileged && (
          <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] p-6 text-sm text-on-surface-variant">
            {isAr
              ? 'مطابقة الفواتير متاحة لمسؤولي ومديري المؤسسة فقط.'
              : 'Invoice matching is available to organisation admins and managers only.'}
          </div>
        )}

      </div>
    </div>
  )
}
