'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/context/LanguageContext'

const PERMIT_TYPES = [
  { value: 'hot_work',          en: 'Hot Work',          ar: 'أعمال ساخنة' },
  { value: 'confined_space',    en: 'Confined Space',    ar: 'مكان محصور' },
  { value: 'electrical',        en: 'Electrical',        ar: 'كهربائي' },
  { value: 'working_at_height', en: 'Working at Height', ar: 'العمل على ارتفاع' },
  { value: 'excavation',        en: 'Excavation',        ar: 'حفر' },
  { value: 'general',           en: 'General',           ar: 'عام' },
]

export default function NewPermitPage() {
  const router = useRouter()
  const supabase = createClient()
  const { lang } = useLanguage()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [workOrders, setWorkOrders] = useState<any[]>([])
  const [permitType, setPermitType] = useState('hot_work')
  const [workOrderId, setWorkOrderId] = useState('')
  const [hazards, setHazards] = useState('')
  const [controls, setControls] = useState('')
  const [validFrom, setValidFrom] = useState('')
  const [validTo, setValidTo] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [orgId, setOrgId] = useState('')
  const [userId, setUserId] = useState('')

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    setUserId(user.id)
    const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
    if (!profile) { setLoading(false); return }
    setOrgId(profile.organisation_id)
    const { data: wos } = await supabase.from('work_orders')
      .select('id, title')
      .eq('organisation_id', profile.organisation_id)
      .order('created_at', { ascending: false })
      .limit(200)
    if (wos) setWorkOrders(wos)
    setLoading(false)
  }

  async function handleSubmit(e: React.FormEvent, status: 'draft' | 'requested') {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    if (validFrom && validTo && new Date(validTo) < new Date(validFrom)) {
      setError(lang === 'ar' ? 'تاريخ الانتهاء قبل تاريخ البدء' : 'Valid-to is before valid-from')
      setSubmitting(false)
      return
    }
    const { data, error: insertError } = await supabase.from('work_permits').insert({
      organisation_id: orgId,
      work_order_id: workOrderId || null,
      permit_type: permitType,
      status,
      hazards: hazards || null,
      controls: controls || null,
      valid_from: validFrom || null,
      valid_to: validTo || null,
      requested_by: userId,
    }).select().single()
    if (insertError) {
      setError(insertError.message)
      setSubmitting(false)
      return
    }
    router.push('/dashboard/permits/' + data.id)
  }

  const fieldStyle = { width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' as const, background: 'white' }
  const labelStyle = { display: 'block' as const, marginBottom: 6, fontSize: 13, fontWeight: 500 as const, color: '#444' }

  if (loading) return <div style={{ padding: '2rem' }}>{lang === 'ar' ? 'جار التحميل...' : 'Loading...'}</div>

  return (
    <div style={{ padding: '2rem', maxWidth: 720, margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <a href='/dashboard/permits' style={{ color: '#999', fontSize: 13, textDecoration: 'none' }}>{lang === 'ar' ? 'رجوع للتصاريح' : 'Back to Permits'}</a>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0.5rem 0 0' }}>{lang === 'ar' ? 'تصريح عمل جديد' : 'New Work Permit'}</h1>
      </div>

      <form onSubmit={e => handleSubmit(e, 'requested')} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div>
          <label style={labelStyle}>{lang === 'ar' ? 'نوع التصريح' : 'Permit Type'} *</label>
          <select value={permitType} onChange={e => setPermitType(e.target.value)} required style={fieldStyle}>
            {PERMIT_TYPES.map(t => <option key={t.value} value={t.value}>{lang === 'ar' ? t.ar : t.en}</option>)}
          </select>
        </div>

        <div>
          <label style={labelStyle}>{lang === 'ar' ? 'أمر العمل (اختياري)' : 'Work Order (optional)'}</label>
          <select value={workOrderId} onChange={e => setWorkOrderId(e.target.value)} style={fieldStyle}>
            <option value=''>{lang === 'ar' ? 'بدون أمر عمل' : 'No work order'}</option>
            {workOrders.map(w => <option key={w.id} value={w.id}>{w.title}</option>)}
          </select>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>{lang === 'ar' ? 'صالح من' : 'Valid From'}</label>
            <input type='datetime-local' value={validFrom} onChange={e => setValidFrom(e.target.value)} style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>{lang === 'ar' ? 'صالح إلى' : 'Valid To'}</label>
            <input type='datetime-local' value={validTo} onChange={e => setValidTo(e.target.value)} style={fieldStyle} />
          </div>
        </div>

        <div>
          <label style={labelStyle}>{lang === 'ar' ? 'المخاطر' : 'Hazards'}</label>
          <textarea value={hazards} onChange={e => setHazards(e.target.value)} rows={3} style={{ ...fieldStyle, resize: 'vertical' }} placeholder={lang === 'ar' ? 'المخاطر المحددة...' : 'Identified hazards...'} />
        </div>

        <div>
          <label style={labelStyle}>{lang === 'ar' ? 'إجراءات التحكم' : 'Controls'}</label>
          <textarea value={controls} onChange={e => setControls(e.target.value)} rows={3} style={{ ...fieldStyle, resize: 'vertical' }} placeholder={lang === 'ar' ? 'تدابير التحكم...' : 'Control measures...'} />
        </div>

        {error && <p style={{ color: 'red', fontSize: 13, margin: 0 }}>{error}</p>}

        <div style={{ display: 'flex', gap: 10 }}>
          <button type='button' disabled={submitting} onClick={e => handleSubmit(e as unknown as React.FormEvent, 'draft')}
            style={{ background: 'white', color: '#1a1a2e', padding: '12px', borderRadius: 8, border: '1px solid #ddd', cursor: submitting ? 'not-allowed' : 'pointer', fontWeight: 500, fontSize: 15, flex: 1, opacity: submitting ? 0.7 : 1 }}>
            {lang === 'ar' ? 'حفظ كمسودة' : 'Save as Draft'}
          </button>
          <button type='submit' disabled={submitting}
            style={{ background: '#1a1a2e', color: 'white', padding: '12px', borderRadius: 8, border: 'none', cursor: submitting ? 'not-allowed' : 'pointer', fontWeight: 500, fontSize: 15, flex: 1, opacity: submitting ? 0.7 : 1 }}>
            {submitting ? (lang === 'ar' ? 'جار الحفظ...' : 'Saving...') : (lang === 'ar' ? 'إرسال الطلب' : 'Submit Request')}
          </button>
        </div>
      </form>
    </div>
  )
}
