// web/src/app/dashboard/procurement/requisitions/[id]/page.tsx
// P1: requisition detail — lines, the approval timeline, and whichever action the
// caller is actually allowed to take.
//
// Every button here is cosmetic gating only: submit_requisition() and
// decide_requisition() re-check the caller server-side, so hiding a button is a
// convenience, never the security boundary (playbook A3).
'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { useLanguage } from '@/context/LanguageContext'
import { STATUS_CLS, statusLabel, type ReqStatus } from '../statusStyles'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any

const STEP_ICON: Record<string, string> = {
  pending: 'schedule',
  approved: 'check_circle',
  rejected: 'cancel',
}
const STEP_COLOR: Record<string, string> = {
  pending: 'text-on-surface-variant',
  approved: 'text-primary',
  rejected: 'text-error',
}

export default function RequisitionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { lang } = useLanguage()
  const isAr = lang === 'ar'
  const supabase = createClient()

  const [req, setReq] = useState<Row>(null)
  const [lines, setLines] = useState<Row[]>([])
  const [steps, setSteps] = useState<Row[]>([])
  const [vendors, setVendors] = useState<Row[]>([])
  const [me, setMe] = useState<{ id: string; role: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [comment, setComment] = useState('')
  const [vendorId, setVendorId] = useState('')

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [id])

  async function load() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data: profile } = await supabase
      .from('users').select('id, role, organisation_id').eq('id', user.id).single()
    if (!profile) { setLoading(false); return }
    setMe({ id: profile.id, role: profile.role })

    const [rRes, lRes, sRes, vRes] = await Promise.all([
      supabase.from('requisitions')
        .select('*, site:site_id(name), cost_center:cost_center_id(name, code), creator:created_by(full_name)')
        .eq('id', id).maybeSingle(),
      supabase.from('requisition_items').select('*, item:item_id(name, sku)').eq('requisition_id', id),
      supabase.from('requisition_approvals')
        .select('*, approver:approver_user_id(full_name, email)')
        .eq('requisition_id', id).order('step_order'),
      supabase.from('vendors').select('id, company_name').order('company_name'),
    ])
    if (rRes.error) setError(rRes.error.message)
    setReq(rRes.data)
    setLines(lRes.data ?? [])
    setSteps(sRes.data ?? [])
    setVendors(vRes.data ?? [])
    setLoading(false)
  }

  async function call(path: string, body?: unknown, key = path) {
    setError(''); setBusy(key)
    const res = await fetch(`/api/procurement/requisitions/${id}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    })
    setBusy('')
    if (!res.ok) {
      const b = await res.json().catch(() => ({}))
      setError(b.error || (isAr ? 'فشل الإجراء' : 'Action failed'))
      return null
    }
    return res.json()
  }

  async function doSubmit() { if (await call('/submit')) { setComment(''); load() } }
  async function doDecide(approve: boolean) {
    const out = await call('/decide', { approve, comment: comment || null }, approve ? 'approve' : 'reject')
    if (out) { setComment(''); load() }
  }
  async function doConvert() {
    const out = await call('/convert', { vendor_id: vendorId || null }, 'convert')
    if (out?.purchase_order) router.push('/dashboard/purchase-orders')
  }

  if (loading) return <div className="p-8 text-on-surface-variant">{isAr ? 'جارٍ التحميل…' : 'Loading…'}</div>
  if (!req) return (
    <div className="p-8">
      <p className="text-on-surface-variant">{isAr ? 'الطلب غير موجود.' : 'Requisition not found.'}</p>
      {error && <p className="text-error text-sm mt-2">{error}</p>}
      <Link href="/dashboard/procurement/requisitions" className="text-primary text-sm font-semibold hover:underline">
        {isAr ? 'العودة إلى القائمة' : 'Back to the list'}
      </Link>
    </div>
  )

  const total = lines.reduce((s, l) => s + Number(l.quantity ?? 0) * Number(l.unit_cost ?? 0), 0)
  const isPrivileged = me?.role === 'admin' || me?.role === 'manager'
  const isCreator = me?.id === req.created_by
  const currentStep = steps.find(s => s.status === 'pending')
  const canSubmit = ['draft', 'rejected'].includes(req.status) && (isCreator || isPrivileged)
  const canDecide = req.status === 'pending_approval' && currentStep?.approver_user_id === me?.id
  const canConvert = req.status === 'approved' && isPrivileged

  const fieldCls = 'w-full bg-surface-container-low border border-outline-variant rounded-xl px-3 py-2 text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary'

  return (
    <div className="star-pattern bg-surface min-h-screen p-8" dir={isAr ? 'rtl' : 'ltr'}>
      <div className="max-w-4xl mx-auto space-y-6">

        <div className="flex items-start gap-3">
          <Link href="/dashboard/procurement/requisitions" className="text-on-surface-variant hover:text-on-surface mt-1">
            <span className="material-symbols-outlined">{isAr ? 'arrow_forward' : 'arrow_back'}</span>
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-3xl font-bold text-on-surface">#{req.requisition_number}</h1>
              <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_CLS[req.status as ReqStatus] ?? ''}`}>
                {statusLabel(req.status as ReqStatus, isAr)}
              </span>
            </div>
            <p className="text-on-surface text-lg mt-1">{req.title}</p>
          </div>
        </div>

        {error && (
          <div className="bg-error/10 border border-error/20 rounded-lg px-3 py-2 text-error text-sm">{error}</div>
        )}

        {/* Meta */}
        <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-6 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          {[
            { k: isAr ? 'مقدّم الطلب' : 'Requested by', v: req.creator?.full_name ?? '—' },
            { k: isAr ? 'الموقع' : 'Site', v: req.site?.name ?? '—' },
            { k: isAr ? 'مركز التكلفة' : 'Cost center', v: req.cost_center ? (req.cost_center.code ? `${req.cost_center.code} · ${req.cost_center.name}` : req.cost_center.name) : '—' },
            { k: isAr ? 'مطلوب بحلول' : 'Needed by', v: req.needed_by ?? '—' },
          ].map(f => (
            <div key={f.k}>
              <div className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-1">{f.k}</div>
              <div className="text-on-surface">{f.v}</div>
            </div>
          ))}
          {req.justification && (
            <div className="col-span-2 sm:col-span-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant mb-1">
                {isAr ? 'المبرر' : 'Justification'}
              </div>
              <div className="text-on-surface whitespace-pre-wrap">{req.justification}</div>
            </div>
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

        {/* Approval timeline */}
        <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-6">
          <h2 className="text-sm font-semibold text-on-surface mb-4">
            {isAr ? 'سلسلة الموافقات' : 'Approval chain'}
          </h2>
          {steps.length === 0 ? (
            <p className="text-sm text-on-surface-variant">
              {req.status === 'draft'
                ? (isAr ? 'تُبنى السلسلة عند الإرسال، حسب حد المبلغ.' : 'The chain is built on submit, from the amount band.')
                : (isAr ? 'لا توجد خطوات موافقة — تمت الموافقة تلقائياً.' : 'No approval steps — auto-approved.')}
            </p>
          ) : (
            <ol className="space-y-4">
              {steps.map(s => (
                <li key={s.id} className="flex gap-3">
                  <span className={`material-symbols-outlined ${STEP_COLOR[s.status] ?? ''}`}>
                    {STEP_ICON[s.status] ?? 'schedule'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-on-surface">
                      <span className="font-semibold">{s.step_order}.</span>{' '}
                      {s.approver?.full_name ?? s.approver?.email ?? '—'}
                      {s.label && <span className="text-on-surface-variant"> · {s.label}</span>}
                    </div>
                    {s.comment && <p className="text-sm text-on-surface-variant mt-0.5">{s.comment}</p>}
                    {s.acted_at && (
                      <p className="text-xs text-outline mt-0.5">{new Date(s.acted_at).toLocaleString()}</p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* Linked PO */}
        {req.purchase_order_id && (
          <div className="bg-primary/5 border border-primary/20 rounded-[12px] p-4 text-sm flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">shopping_bag</span>
            <Link href="/dashboard/purchase-orders" className="text-primary font-semibold hover:underline">
              {isAr ? 'عرض أمر الشراء الناتج' : 'View the purchase order this became'}
            </Link>
          </div>
        )}

        {/* Actions */}
        {(canSubmit || canDecide || canConvert) && (
          <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-6 space-y-4">
            {canDecide && (
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">
                  {isAr ? 'تعليق (مطلوب عند الرفض)' : 'Comment (required to reject)'}
                </label>
                <textarea value={comment} onChange={e => setComment(e.target.value)} rows={2} className={fieldCls} />
              </div>
            )}
            {canConvert && (
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">
                  {isAr ? 'المورد (اختياري)' : 'Vendor (optional)'}
                </label>
                <select value={vendorId} onChange={e => setVendorId(e.target.value)} className={fieldCls}>
                  <option value="">{isAr ? '— لاحقاً —' : '— Decide later —'}</option>
                  {vendors.map(v => <option key={v.id} value={v.id}>{v.company_name}</option>)}
                </select>
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              {canSubmit && (
                <button onClick={doSubmit} disabled={busy !== ''}
                  className="bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm disabled:opacity-50">
                  {busy === '/submit' ? '…' : (isAr ? 'إرسال للموافقة' : 'Send for approval')}
                </button>
              )}
              {canDecide && (
                <>
                  <button onClick={() => doDecide(true)} disabled={busy !== ''}
                    className="bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm disabled:opacity-50">
                    {busy === 'approve' ? '…' : (isAr ? 'موافقة' : 'Approve')}
                  </button>
                  <button onClick={() => doDecide(false)} disabled={busy !== '' || comment.trim() === ''}
                    title={comment.trim() === '' ? (isAr ? 'أضف تعليقاً للرفض' : 'Add a comment to reject') : undefined}
                    className="px-5 py-2.5 rounded-xl border border-error/40 text-error text-sm font-semibold hover:bg-error/5 disabled:opacity-50 transition-colors">
                    {busy === 'reject' ? '…' : (isAr ? 'رفض' : 'Reject')}
                  </button>
                </>
              )}
              {canConvert && (
                <button onClick={doConvert} disabled={busy !== ''}
                  className="bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm disabled:opacity-50">
                  {busy === 'convert' ? '…' : (isAr ? 'تحويل إلى أمر شراء' : 'Convert to purchase order')}
                </button>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
