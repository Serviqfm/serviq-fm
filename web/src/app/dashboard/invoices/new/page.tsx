'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'
import { useLanguage } from '@/context/LanguageContext'
import { C, F, primaryBtn, secondaryBtn, inputStyle, labelStyle, cardStyle, pageStyle, sectionCard } from '@/lib/brand'
import { formatSAR } from '@/lib/zatca'

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

export default function NewInvoicePage() {
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

    const hrs  = hoursFromDates(woData.started_at, woData.completed_at)
    const rate = Number(woData.assignee?.hourly_rate ?? 0)
    setLaborHours(String(hrs))
    setLaborRate(String(rate))

    const { data: comments } = await supabase
      .from('work_order_comments')
      .select('body')
      .eq('work_order_id', woId)
      .order('created_at', { ascending: true })
    if (comments) setSpareParts(parsePartsFromComments(comments))

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

  const numInput = { ...inputStyle, textAlign: 'right' as const, maxWidth: 160 }
  const row      = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 } as const

  if (loading) return <div style={{ padding: '2rem', fontFamily: F.en, color: C.textMid }}>Loading...</div>
  if (!wo)     return <div style={{ padding: '2rem', fontFamily: F.en, color: C.textMid }}>Work order not found.</div>

  return (
    <div style={{ ...pageStyle, maxWidth: 720, fontFamily: isAr ? F.ar : F.en, direction: isAr ? 'rtl' : 'ltr' }}>
      <div style={{ marginBottom: 24 }}>
        <a href='/dashboard/invoices' style={{ color: C.textLight, fontSize: 13, textDecoration: 'none' }}>
          {isAr ? '← الفواتير' : '← Invoices'}
        </a>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: C.navy, margin: '8px 0 4px' }}>
          {isAr ? 'إنشاء فاتورة' : 'Generate Invoice'}
        </h1>
        <p style={{ fontSize: 13, color: C.textMid, margin: 0 }}>
          {wo.title} {wo.site?.name ? `· ${wo.site.name}` : ''}
        </p>
      </div>

      {/* Service Charges */}
      <div style={{ ...sectionCard }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: C.textLight, textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 16px' }}>
          {isAr ? 'رسوم الخدمة' : 'Service Charges'}
        </p>
        <div style={row}>
          <label style={labelStyle}>{isAr ? 'رسوم الخدمة (ريال)' : 'Service Charges (SAR)'}</label>
          <input
            type='number' min='0' step='0.01'
            value={serviceCharges}
            onChange={e => setServiceCharges(e.target.value)}
            style={numInput}
          />
        </div>
      </div>

      {/* Labour Charges */}
      <div style={{ ...sectionCard }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: C.textLight, textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 16px' }}>
          {isAr ? 'رسوم العمالة' : 'Labour Charges'}
        </p>
        <div style={row}>
          <label style={labelStyle}>{isAr ? 'ساعات العمل' : 'Hours Worked'}</label>
          <input
            type='number' min='0' step='0.25'
            value={laborHours}
            onChange={e => setLaborHours(e.target.value)}
            style={numInput}
          />
        </div>
        <div style={row}>
          <label style={labelStyle}>{isAr ? 'معدل الساعة (ريال/ساعة)' : 'Hourly Rate (SAR/hr)'}</label>
          <input
            type='number' min='0' step='0.01'
            value={laborRate}
            onChange={e => setLaborRate(e.target.value)}
            style={numInput}
          />
        </div>
        <div style={{ ...row, borderTop: `1px solid ${C.border}`, paddingTop: 12, marginTop: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.textDark }}>{isAr ? 'إجمالي العمالة' : 'Labour Total'}</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.navy }}>{formatSAR(lc)}</span>
        </div>
      </div>

      {/* Spare Parts */}
      <div style={{ ...sectionCard }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: C.textLight, textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 16px' }}>
          {isAr ? 'قطع الغيار' : 'Spare Parts'}
        </p>
        {spareParts.length === 0 ? (
          <p style={{ fontSize: 13, color: C.textLight, margin: 0 }}>
            {isAr ? 'لم يتم تسجيل قطع غيار لهذا الأمر.' : 'No spare parts recorded for this work order.'}
          </p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                <th style={{ textAlign: 'left', padding: '4px 8px', color: C.textLight, fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>{isAr ? 'الاسم' : 'Name'}</th>
                <th style={{ textAlign: 'right', padding: '4px 8px', color: C.textLight, fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>{isAr ? 'الكمية' : 'Qty'}</th>
                <th style={{ textAlign: 'right', padding: '4px 8px', color: C.textLight, fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>{isAr ? 'سعر الوحدة' : 'Unit Cost'}</th>
                <th style={{ textAlign: 'right', padding: '4px 8px', color: C.textLight, fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>{isAr ? 'الإجمالي' : 'Total'}</th>
              </tr>
            </thead>
            <tbody>
              {spareParts.map((p, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: '6px 8px', color: C.textDark }}>{p.name}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', color: C.textMid }}>{p.qty}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', color: C.textMid }}>{formatSAR(p.unit_cost)}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600, color: C.navy }}>{formatSAR(p.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12, borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.textDark, marginRight: 16 }}>{isAr ? 'إجمالي قطع الغيار' : 'Parts Total'}</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.navy }}>{formatSAR(spTotal)}</span>
        </div>
      </div>

      {/* Surcharges */}
      <div style={{ ...sectionCard }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: C.textLight, textTransform: 'uppercase', letterSpacing: 1, margin: 0 }}>
            {isAr ? 'رسوم إضافية' : 'Additional Surcharges'}
          </p>
          <button type='button' onClick={addSurcharge} style={{ ...secondaryBtn, padding: '4px 12px', fontSize: 12 }}>
            + {isAr ? 'إضافة' : 'Add'}
          </button>
        </div>
        {surcharges.length === 0 ? (
          <p style={{ fontSize: 13, color: C.textLight, margin: 0 }}>{isAr ? 'لا توجد رسوم إضافية.' : 'No surcharges.'}</p>
        ) : surcharges.map((s, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input
              placeholder={isAr ? 'الوصف' : 'Description'}
              value={s.label}
              onChange={e => updateSurcharge(i, 'label', e.target.value)}
              style={{ ...inputStyle, flex: 1 }}
            />
            <input
              type='number' min='0' step='0.01'
              placeholder='0.00'
              value={s.amount || ''}
              onChange={e => updateSurcharge(i, 'amount', e.target.value)}
              style={{ ...inputStyle, width: 120, textAlign: 'right' }}
            />
            <button type='button' onClick={() => removeSurcharge(i)} style={{ background: 'none', border: 'none', color: C.danger, cursor: 'pointer', fontSize: 18, padding: '0 4px' }}>×</button>
          </div>
        ))}
      </div>

      {/* Invoice Summary */}
      <div style={{ ...cardStyle, padding: 24, marginBottom: 24 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: C.textLight, textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 16px' }}>
          {isAr ? 'ملخص الفاتورة' : 'Invoice Summary'}
        </p>
        {[
          { label: isAr ? 'رسوم الخدمة'  : 'Service Charges', value: sc },
          { label: isAr ? 'رسوم العمالة' : 'Labour Charges',  value: lc },
          { label: isAr ? 'قطع الغيار'   : 'Spare Parts',     value: spTotal },
          ...(surTotal > 0 ? [{ label: isAr ? 'رسوم إضافية' : 'Surcharges', value: surTotal }] : []),
        ].map((line, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 13, color: C.textMid }}>{line.label}</span>
            <span style={{ fontSize: 13, color: C.textDark }}>{formatSAR(line.value)}</span>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, borderTop: `1px solid ${C.border}`, paddingTop: 10, marginTop: 4 }}>
          <span style={{ fontSize: 13, color: C.textMid }}>{isAr ? 'المجموع (بدون ضريبة)' : 'Subtotal (excl. VAT)'}</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.textDark }}>{formatSAR(subtotal)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontSize: 13, color: C.textMid }}>{isAr ? 'ضريبة القيمة المضافة (15%)' : 'VAT (15%)'}</span>
          <span style={{ fontSize: 13, color: C.textMid }}>{formatSAR(vat)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: `2px solid ${C.navy}`, paddingTop: 12 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: C.navy }}>{isAr ? 'الإجمالي (شامل الضريبة)' : 'TOTAL (incl. VAT)'}</span>
          <span style={{ fontSize: 16, fontWeight: 700, color: C.teal }}>{formatSAR(total)}</span>
        </div>
      </div>

      {error && <p style={{ color: C.danger, fontSize: 13, marginBottom: 12 }}>{error}</p>}

      <div style={{ display: 'flex', gap: 10 }}>
        <button
          disabled={saving || subtotal <= 0}
          onClick={handleSubmit}
          style={{ ...primaryBtn, flex: 1, opacity: (saving || subtotal <= 0) ? 0.6 : 1, cursor: (saving || subtotal <= 0) ? 'not-allowed' : 'pointer' }}
        >
          {saving
            ? (isAr ? 'جاري الحفظ...' : 'Saving...')
            : (isAr ? 'تأكيد وحفظ الفاتورة' : 'Confirm & Save Invoice')}
        </button>
        <a href='/dashboard/invoices' style={{ flex: 1 }}>
          <button type='button' style={{ ...secondaryBtn, width: '100%' }}>
            {isAr ? 'إلغاء' : 'Cancel'}
          </button>
        </a>
      </div>
    </div>
  )
}
