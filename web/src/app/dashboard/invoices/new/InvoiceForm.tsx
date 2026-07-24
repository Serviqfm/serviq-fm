'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'
import { useLanguage } from '@/context/LanguageContext'
import { formatSAR } from '@/lib/zatca'
import { laborFromTimeLogs } from '@/lib/invoicePrefill'

type SparePart = { name: string; qty: number; unit_cost: number; total: number }
type Surcharge = { label: string; amount: number }

function parsePartsFromComments(comments: { body: string }[]): SparePart[] {
  const parts: SparePart[] = []
  for (const c of comments) {
    const m = c.body.match(/^\[ACTIVITY\] Parts used: ([\d.]+) x (.+?) \(SAR ([\d.]+)\)$/)
    if (m) {
      const qty       = parseFloat(m[1])
      const name      = m[2]
      const total     = parseFloat(m[3])
      const unit_cost = qty > 0 ? parseFloat((total / qty).toFixed(2)) : 0
      parts.push({ name, qty, unit_cost, total })
    }
  }
  return parts
}

function hoursFromDates(start: string | null, end: string | null): number {
  if (!start || !end) return 0
  const diff = (new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60 * 60)
  return Math.max(0, parseFloat(diff.toFixed(2)))
}

export default function InvoiceForm() {
  const router   = useRouter()
  const params   = useSearchParams()
  const woId     = params.get('wo') ?? ''
  const supabase = createClient()
  const { lang } = useLanguage()
  const isAr     = lang === 'ar'

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [wo, setWo]                         = useState<any>(null)
  const [loading, setLoading]               = useState(true)
  const [saving, setSaving]                 = useState(false)
  const [error, setError]                   = useState('')

  const [serviceCharges, setServiceCharges] = useState('0')
  const [laborHours, setLaborHours]         = useState('0')
  const [laborRate, setLaborRate]           = useState('0')
  const [spareParts, setSpareParts]         = useState<SparePart[]>([])
  const [surcharges, setSurcharges]         = useState<Surcharge[]>([])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (woId) loadWO() }, [woId])

  async function loadWO() {
    setLoading(true)
    const { data: woData } = await supabase
      .from('work_orders')
      .select('*, assignee:assigned_to(full_name, hourly_rate), site:site_id(name)')
      .eq('id', woId)
      .single()

    if (!woData) { setLoading(false); return }
    setWo(woData)

    setServiceCharges(String(woData.actual_cost ?? 0))

    const rate = Number(woData.assignee?.hourly_rate ?? 0)

    const [{ data: comments }, { data: timeLogs }, { data: woCosts }] = await Promise.all([
      supabase.from('work_order_comments').select('body').eq('work_order_id', woId).order('created_at', { ascending: true }),
      supabase.from('work_order_time_logs').select('minutes, hourly_rate').eq('work_order_id', woId),
      supabase.from('work_order_costs').select('description, amount').eq('work_order_id', woId).order('created_at', { ascending: true }),
    ])
    if (comments) setSpareParts(parsePartsFromComments(comments))

    // WO-06 — prefill labor from logged time (snapshotted rates); fall back to the
    // old started/completed heuristic when nothing was logged. Fields stay editable.
    const labor = laborFromTimeLogs(timeLogs ?? [], rate)
    setLaborHours(String(labor ? labor.hours : hoursFromDates(woData.started_at, woData.completed_at)))
    setLaborRate(String(labor ? labor.rate : rate))

    // WO-07 — prefill WO additional costs as editable surcharge line items.
    if (woCosts?.length) {
      setSurcharges(woCosts.map(c => ({
        label:  c.description ?? '',
        amount: parseFloat(Number(c.amount ?? 0).toFixed(2)),
      })))
    }

    setLoading(false)
  }

  const sc       = parseFloat(serviceCharges) || 0
  const lh       = parseFloat(laborHours)     || 0
  const lr       = parseFloat(laborRate)      || 0
  const lc       = parseFloat((lh * lr).toFixed(2))
  const spTotal  = parseFloat(spareParts.reduce((s, p) => s + p.total, 0).toFixed(2))
  const surTotal = parseFloat(surcharges.reduce((s, x) => s + (parseFloat(String(x.amount)) || 0), 0).toFixed(2))
  const subtotal = parseFloat((sc + lc + spTotal + surTotal).toFixed(2))
  const vat      = parseFloat((subtotal * 0.15).toFixed(2))
  const total    = parseFloat((subtotal + vat).toFixed(2))

  function addSurcharge() {
    setSurcharges(prev => [...prev, { label: '', amount: 0 }])
  }
  function updateSurcharge(i: number, key: 'label' | 'amount', val: string) {
    setSurcharges(prev => prev.map((s, idx) => idx === i ? { ...s, [key]: key === 'amount' ? parseFloat(val) || 0 : val } : s))
  }
  function removeSurcharge(i: number) {
    setSurcharges(prev => prev.filter((_, idx) => idx !== i))
  }

  async function handleSubmit() {
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/invoices/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          work_order_id:   woId,
          service_charges: sc,
          labor_hours:     lh,
          labor_rate:      lr,
          spare_parts:     spareParts,
          surcharges:      surcharges.filter(s => s.label.trim()),
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to create invoice'); setSaving(false); return }
      router.push('/dashboard/invoices')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
      setSaving(false)
    }
  }

  if (loading) return (
    <div className="p-8 text-on-surface-variant text-sm">Loading...</div>
  )
  if (!wo) return (
    <div className="p-8 text-on-surface-variant text-sm">Work order not found.</div>
  )

  return (
    <div
      className="star-pattern bg-surface min-h-screen p-8"
      style={{ maxWidth: 720, margin: '0 auto', fontFamily: isAr ? 'Cairo, sans-serif' : 'Inter, sans-serif', direction: isAr ? 'rtl' : 'ltr' }}
    >
      {/* Header */}
      <div className="mb-6">
        <a href='/dashboard/invoices' className="text-outline text-[13px] no-underline hover:text-on-surface-variant transition-colors">
          {isAr ? '← الفواتير' : '← Invoices'}
        </a>
        <h1 className="text-2xl font-bold text-on-surface mt-2 mb-1">
          {isAr ? 'إنشاء فاتورة' : 'Generate Invoice'}
        </h1>
        <p className="text-[13px] text-on-surface-variant m-0">
          {wo.title} {wo.site?.name ? `· ${wo.site.name}` : ''}
        </p>
      </div>

      {/* Service Charges */}
      <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-5 mb-4">
        <p className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-4 m-0">
          {isAr ? 'رسوم الخدمة' : 'Service Charges'}
        </p>
        <div className="flex justify-between items-center mb-3">
          <label className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-0">
            {isAr ? 'رسوم الخدمة (ريال)' : 'Service Charges (SAR)'}
          </label>
          <input
            type='number' min='0' step='0.01'
            value={serviceCharges}
            onChange={e => setServiceCharges(e.target.value)}
            className="bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-right w-[160px]"
          />
        </div>
      </div>

      {/* Labour Charges */}
      <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-5 mb-4">
        <p className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-4 m-0">
          {isAr ? 'رسوم العمالة' : 'Labour Charges'}
        </p>
        <div className="flex justify-between items-center mb-3">
          <label className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-0">
            {isAr ? 'ساعات العمل' : 'Hours Worked'}
          </label>
          <input
            type='number' min='0' step='0.25'
            value={laborHours}
            onChange={e => setLaborHours(e.target.value)}
            className="bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-right w-[160px]"
          />
        </div>
        <div className="flex justify-between items-center mb-3">
          <label className="block text-[11px] font-bold uppercase tracking-wider text-secondary mb-0">
            {isAr ? 'معدل الساعة (ريال/ساعة)' : 'Hourly Rate (SAR/hr)'}
          </label>
          <input
            type='number' min='0' step='0.01'
            value={laborRate}
            onChange={e => setLaborRate(e.target.value)}
            className="bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-right w-[160px]"
          />
        </div>
        <div className="flex justify-between items-center border-t border-outline-variant/30 pt-3 mt-1">
          <span className="text-[13px] font-semibold text-on-surface">{isAr ? 'إجمالي العمالة' : 'Labour Total'}</span>
          <span className="text-[13px] font-bold text-on-surface">{formatSAR(lc)}</span>
        </div>
      </div>

      {/* Spare Parts */}
      <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-5 mb-4">
        <p className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-4 m-0">
          {isAr ? 'قطع الغيار' : 'Spare Parts'}
        </p>
        {spareParts.length === 0 ? (
          <p className="text-[13px] text-on-surface-variant m-0">
            {isAr ? 'لم يتم تسجيل قطع غيار لهذا الأمر.' : 'No spare parts recorded for this work order.'}
          </p>
        ) : (
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-outline-variant/30">
                <th className="text-left px-2 py-1 text-on-surface-variant font-semibold text-[11px] uppercase">{isAr ? 'الاسم' : 'Name'}</th>
                <th className="text-right px-2 py-1 text-on-surface-variant font-semibold text-[11px] uppercase">{isAr ? 'الكمية' : 'Qty'}</th>
                <th className="text-right px-2 py-1 text-on-surface-variant font-semibold text-[11px] uppercase">{isAr ? 'سعر الوحدة' : 'Unit Cost'}</th>
                <th className="text-right px-2 py-1 text-on-surface-variant font-semibold text-[11px] uppercase">{isAr ? 'الإجمالي' : 'Total'}</th>
              </tr>
            </thead>
            <tbody>
              {spareParts.map((p, i) => (
                <tr key={i} className="border-b border-outline-variant/20">
                  <td className="px-2 py-1.5 text-on-surface">{p.name}</td>
                  <td className="px-2 py-1.5 text-right text-on-surface-variant">{p.qty}</td>
                  <td className="px-2 py-1.5 text-right text-on-surface-variant">{formatSAR(p.unit_cost)}</td>
                  <td className="px-2 py-1.5 text-right font-semibold text-on-surface">{formatSAR(p.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="flex justify-end mt-3 border-t border-outline-variant/30 pt-3">
          <span className="text-[13px] font-semibold text-on-surface mr-4">{isAr ? 'إجمالي قطع الغيار' : 'Parts Total'}</span>
          <span className="text-[13px] font-bold text-on-surface">{formatSAR(spTotal)}</span>
        </div>
      </div>

      {/* Surcharges */}
      <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-5 mb-4">
        <div className="flex justify-between items-center mb-4">
          <p className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider m-0">
            {isAr ? 'رسوم إضافية' : 'Additional Surcharges'}
          </p>
          <button
            type='button'
            onClick={addSurcharge}
            className="border border-outline-variant text-on-surface-variant px-3 py-1 rounded-xl text-xs font-semibold hover:bg-surface-container-low transition-colors"
          >
            + {isAr ? 'إضافة' : 'Add'}
          </button>
        </div>
        {surcharges.length === 0 ? (
          <p className="text-[13px] text-on-surface-variant m-0">{isAr ? 'لا توجد رسوم إضافية.' : 'No surcharges.'}</p>
        ) : surcharges.map((s, i) => (
          <div key={i} className="flex gap-2 mb-2">
            <input
              placeholder={isAr ? 'الوصف' : 'Description'}
              value={s.label}
              onChange={e => updateSurcharge(i, 'label', e.target.value)}
              className="flex-1 bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
            />
            <input
              type='number' min='0' step='0.01'
              placeholder='0.00'
              value={s.amount || ''}
              onChange={e => updateSurcharge(i, 'amount', e.target.value)}
              className="w-[120px] bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-right"
            />
            <button
              type='button'
              onClick={() => removeSurcharge(i)}
              className="text-error bg-transparent border-none cursor-pointer text-lg px-1 py-0 hover:text-error/80 transition-colors"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {/* Invoice Summary */}
      <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-6 mb-6">
        <p className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-4 m-0">
          {isAr ? 'ملخص الفاتورة' : 'Invoice Summary'}
        </p>
        {[
          { label: isAr ? 'رسوم الخدمة'  : 'Service Charges', value: sc },
          { label: isAr ? 'رسوم العمالة' : 'Labour Charges',  value: lc },
          { label: isAr ? 'قطع الغيار'   : 'Spare Parts',     value: spTotal },
          ...(surTotal > 0 ? [{ label: isAr ? 'رسوم إضافية' : 'Surcharges', value: surTotal }] : []),
        ].map((line, i) => (
          <div key={i} className="flex justify-between mb-2">
            <span className="text-[13px] text-on-surface-variant">{line.label}</span>
            <span className="text-[13px] text-on-surface">{formatSAR(line.value)}</span>
          </div>
        ))}
        <div className="flex justify-between mb-2 border-t border-outline-variant/30 pt-2.5 mt-1">
          <span className="text-[13px] text-on-surface-variant">{isAr ? 'المجموع (بدون ضريبة)' : 'Subtotal (excl. VAT)'}</span>
          <span className="text-[13px] font-semibold text-on-surface">{formatSAR(subtotal)}</span>
        </div>
        <div className="flex justify-between mb-3">
          <span className="text-[13px] text-on-surface-variant">{isAr ? 'ضريبة القيمة المضافة (15%)' : 'VAT (15%)'}</span>
          <span className="text-[13px] text-on-surface-variant">{formatSAR(vat)}</span>
        </div>
        <div className="flex justify-between border-t-2 border-primary/30 pt-3">
          <span className="text-base font-bold text-on-surface">{isAr ? 'الإجمالي (شامل الضريبة)' : 'TOTAL (incl. VAT)'}</span>
          <span className="text-base font-bold text-secondary">{formatSAR(total)}</span>
        </div>
      </div>

      {error && (
        <p className="text-error text-[13px] mb-3">{error}</p>
      )}

      <div className="flex gap-2.5">
        <button
          disabled={saving || subtotal <= 0}
          onClick={handleSubmit}
          className="flex-1 bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {saving
            ? (isAr ? 'جاري الحفظ...' : 'Saving...')
            : (isAr ? 'تأكيد وحفظ الفاتورة' : 'Confirm & Save Invoice')}
        </button>
        <a href='/dashboard/invoices' className="flex-1">
          <button
            type='button'
            className="w-full border border-outline-variant text-on-surface-variant px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-surface-container-low transition-colors"
          >
            {isAr ? 'إلغاء' : 'Cancel'}
          </button>
        </a>
      </div>
    </div>
  )
}
