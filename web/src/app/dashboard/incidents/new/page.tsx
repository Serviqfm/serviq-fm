'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/context/LanguageContext'
import { SEVERITIES, sevLabel } from '../labels'

export default function NewIncidentPage() {
  const router = useRouter()
  const supabase = createClient()
  const { t, lang } = useLanguage()
  const ar = lang === 'ar'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [sites, setSites] = useState<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [assets, setAssets] = useState<any[]>([])
  const [orgId, setOrgId] = useState('')
  const [userId, setUserId] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    title: '', description: '', severity: 'medium',
    site_id: '', asset_id: '', occurred_at: '',
  })

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)
    const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
    if (!profile) return
    setOrgId(profile.organisation_id)
    const [{ data: siteData }, { data: assetData }] = await Promise.all([
      supabase.from('sites').select('id, name').eq('organisation_id', profile.organisation_id).eq('is_active', true),
      supabase.from('assets').select('id, name').eq('organisation_id', profile.organisation_id).eq('status', 'active'),
    ])
    if (siteData) setSites(siteData)
    if (assetData) setAssets(assetData)
    setLoading(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) { setError(ar ? 'العنوان مطلوب' : 'Title is required'); return }
    setSubmitting(true)
    setError('')
    const { data, error: insertError } = await supabase.from('incidents').insert({
      title: form.title.trim(),
      description: form.description || null,
      severity: form.severity,
      status: 'open',
      site_id: form.site_id || null,
      asset_id: form.asset_id || null,
      occurred_at: form.occurred_at ? new Date(form.occurred_at).toISOString() : null,
      reported_by: userId,
      organisation_id: orgId,
    }).select().single()
    if (insertError) { setError(insertError.message); setSubmitting(false); return }
    router.push('/dashboard/incidents/' + data.id)
  }

  const fieldStyle = {
    width: '100%', padding: '8px 12px', border: '1px solid #ddd',
    borderRadius: 8, fontSize: 14, boxSizing: 'border-box' as const, background: 'white',
  }
  const labelStyle = { display: 'block' as const, marginBottom: 6, fontSize: 13, fontWeight: 500 as const, color: '#444' }

  if (loading) return <div style={{ padding: '2rem' }}>{t('common.loading')}</div>

  return (
    <div style={{ padding: '2rem', maxWidth: 640, margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <a href='/dashboard/incidents' style={{ color: '#999', fontSize: 13, textDecoration: 'none' }}>
          {ar ? 'رجوع للحوادث' : 'Back to Incidents'}
        </a>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0.5rem 0 0' }}>{ar ? 'الإبلاغ عن حادث' : 'Report Incident'}</h1>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div>
          <label style={labelStyle}>{ar ? 'العنوان' : 'Title'} *</label>
          <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required style={fieldStyle}
            placeholder={ar ? 'مثال: تسرب مياه في الطابق الثاني' : 'e.g. Water leak on 2nd floor'} />
        </div>

        <div>
          <label style={labelStyle}>{ar ? 'الوصف' : 'Description'}</label>
          <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
            rows={4} style={{ ...fieldStyle, resize: 'vertical' }} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>{ar ? 'الخطورة' : 'Severity'}</label>
            <select value={form.severity} onChange={e => setForm({ ...form, severity: e.target.value })} style={fieldStyle}>
              {SEVERITIES.map(s => <option key={s} value={s}>{sevLabel(s, ar)}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>{ar ? 'وقت الوقوع' : 'Occurred at'}</label>
            <input type='datetime-local' value={form.occurred_at} onChange={e => setForm({ ...form, occurred_at: e.target.value })} style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>{ar ? 'الموقع (اختياري)' : 'Site (optional)'}</label>
            <select value={form.site_id} onChange={e => setForm({ ...form, site_id: e.target.value })} style={fieldStyle}>
              <option value=''>{ar ? 'اختر موقعاً' : 'Select site'}</option>
              {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>{ar ? 'الأصل (اختياري)' : 'Asset (optional)'}</label>
            <select value={form.asset_id} onChange={e => setForm({ ...form, asset_id: e.target.value })} style={fieldStyle}>
              <option value=''>{ar ? 'اختر أصلاً' : 'Select asset'}</option>
              {assets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        </div>

        {error && <p style={{ color: 'red', fontSize: 13, margin: 0 }}>{error}</p>}

        <button type='submit' disabled={submitting}
          style={{ background: '#1a1a2e', color: 'white', padding: '12px', borderRadius: 8, border: 'none', cursor: submitting ? 'not-allowed' : 'pointer', fontWeight: 500, fontSize: 15, opacity: submitting ? 0.7 : 1 }}>
          {submitting ? t('common.saving') : (ar ? 'الإبلاغ عن الحادث' : 'Report Incident')}
        </button>
      </form>
    </div>
  )
}
