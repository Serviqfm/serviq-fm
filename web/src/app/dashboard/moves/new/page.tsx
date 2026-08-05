'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/context/LanguageContext'

export default function NewMovePage() {
  const router = useRouter()
  const supabase = createClient()
  const { lang } = useLanguage()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [assets, setAssets] = useState<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [spaces, setSpaces] = useState<any[]>([])
  const [subjectType, setSubjectType] = useState<'occupant' | 'asset'>('occupant')
  const [subjectLabel, setSubjectLabel] = useState('')
  const [assetId, setAssetId] = useState('')
  const [fromSpaceId, setFromSpaceId] = useState('')
  const [toSpaceId, setToSpaceId] = useState('')
  const [scheduledFor, setScheduledFor] = useState('')
  const [notes, setNotes] = useState('')
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
    const [{ data: assetData }, { data: spaceData }] = await Promise.all([
      supabase.from('assets').select('id, name, space_id').eq('organisation_id', profile.organisation_id).order('name'),
      supabase.from('spaces').select('id, name, site_id').order('name'),
    ])
    if (assetData) setAssets(assetData)
    if (spaceData) setSpaces(spaceData)
    setLoading(false)
  }

  // When an asset is picked, prefill the label and its current space as the origin.
  function onAssetChange(id: string) {
    setAssetId(id)
    const a = assets.find(x => x.id === id)
    if (a) {
      setSubjectLabel(a.name)
      if (a.space_id) setFromSpaceId(a.space_id)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    if (toSpaceId && toSpaceId === fromSpaceId) {
      setError(lang === 'ar' ? 'المكان المصدر والوجهة متطابقان' : 'Origin and destination are the same')
      setSubmitting(false)
      return
    }
    const { data, error: insertError } = await supabase.from('space_moves').insert({
      organisation_id: orgId,
      subject_type: subjectType,
      subject_label: subjectLabel || null,
      asset_id: subjectType === 'asset' ? (assetId || null) : null,
      from_space_id: fromSpaceId || null,
      to_space_id: toSpaceId || null,
      status: 'requested',
      scheduled_for: scheduledFor || null,
      notes: notes || null,
      requested_by: userId,
    }).select().single()
    if (insertError) {
      setError(insertError.message)
      setSubmitting(false)
      return
    }
    router.push('/dashboard/moves/' + data.id)
  }

  const fieldStyle = { width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' as const, background: 'white' }
  const labelStyle = { display: 'block' as const, marginBottom: 6, fontSize: 13, fontWeight: 500 as const, color: '#444' }

  if (loading) return <div style={{ padding: '2rem' }}>{lang === 'ar' ? 'جار التحميل...' : 'Loading...'}</div>

  return (
    <div style={{ padding: '2rem', maxWidth: 720, margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <a href='/dashboard/moves' style={{ color: '#999', fontSize: 13, textDecoration: 'none' }}>{lang === 'ar' ? 'رجوع للنقل' : 'Back to Moves'}</a>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0.5rem 0 0' }}>{lang === 'ar' ? 'طلب نقل جديد' : 'New Move Request'}</h1>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div>
          <label style={labelStyle}>{lang === 'ar' ? 'الموضوع' : 'Subject'} *</label>
          <select value={subjectType} onChange={e => { setSubjectType(e.target.value as 'occupant' | 'asset'); setAssetId(''); }} required style={fieldStyle}>
            <option value='occupant'>{lang === 'ar' ? 'شاغل' : 'Occupant'}</option>
            <option value='asset'>{lang === 'ar' ? 'أصل' : 'Asset'}</option>
          </select>
        </div>

        {subjectType === 'asset' && (
          <div>
            <label style={labelStyle}>{lang === 'ar' ? 'الأصل' : 'Asset'} *</label>
            <select value={assetId} onChange={e => onAssetChange(e.target.value)} required style={fieldStyle}>
              <option value=''>{lang === 'ar' ? 'اختر أصلًا' : 'Select an asset'}</option>
              {assets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        )}

        <div>
          <label style={labelStyle}>{lang === 'ar' ? 'الوصف' : 'Label'}{subjectType === 'occupant' ? ' *' : ''}</label>
          <input value={subjectLabel} onChange={e => setSubjectLabel(e.target.value)} required={subjectType === 'occupant'} style={fieldStyle} placeholder={lang === 'ar' ? 'مثال: أحمد الأحمد' : 'e.g. Ahmed Al-Ahmad'} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>{lang === 'ar' ? 'من مكان' : 'From Space'}</label>
            <select value={fromSpaceId} onChange={e => setFromSpaceId(e.target.value)} style={fieldStyle}>
              <option value=''>{lang === 'ar' ? 'بدون' : 'None'}</option>
              {spaces.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>{lang === 'ar' ? 'إلى مكان' : 'To Space'} *</label>
            <select value={toSpaceId} onChange={e => setToSpaceId(e.target.value)} required style={fieldStyle}>
              <option value=''>{lang === 'ar' ? 'اختر وجهة' : 'Select destination'}</option>
              {spaces.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label style={labelStyle}>{lang === 'ar' ? 'موعد مقترح' : 'Proposed Date'}</label>
          <input type='datetime-local' value={scheduledFor} onChange={e => setScheduledFor(e.target.value)} style={fieldStyle} />
        </div>

        <div>
          <label style={labelStyle}>{lang === 'ar' ? 'ملاحظات' : 'Notes'}</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} style={{ ...fieldStyle, resize: 'vertical' }} placeholder={lang === 'ar' ? 'تفاصيل إضافية...' : 'Additional details...'} />
        </div>

        {error && <p style={{ color: 'red', fontSize: 13, margin: 0 }}>{error}</p>}

        <div style={{ display: 'flex', gap: 10 }}>
          <button type='submit' disabled={submitting}
            style={{ background: '#1a1a2e', color: 'white', padding: '12px', borderRadius: 8, border: 'none', cursor: submitting ? 'not-allowed' : 'pointer', fontWeight: 500, fontSize: 15, flex: 1, opacity: submitting ? 0.7 : 1 }}>
            {submitting ? (lang === 'ar' ? 'جار الحفظ...' : 'Saving...') : (lang === 'ar' ? 'إرسال الطلب' : 'Submit Request')}
          </button>
        </div>
      </form>
    </div>
  )
}
