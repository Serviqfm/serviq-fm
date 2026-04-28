'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import { useLanguage } from '@/context/LanguageContext'
import { C, F, primaryBtn, secondaryBtn, inputStyle, labelStyle } from '@/lib/brand'

export default function EditSitePage() {
  const router = useRouter()
  const { id } = useParams()
  const { lang } = useLanguage()
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ name: '', name_ar: '', city: '', address: '' })

  useEffect(() => { loadSite() }, [id])

  async function loadSite() {
    const { data } = await supabase.from('sites').select('*').eq('id', id).single()
    if (data) setForm({ name: data.name ?? '', name_ar: data.name_ar ?? '', city: data.city ?? '', address: data.address ?? '' })
    setLoading(false)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const { error: updateError } = await supabase.from('sites').update({
      name: form.name,
      name_ar: form.name_ar || null,
      city: form.city || null,
      address: form.address || null,
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    if (updateError) { setError(updateError.message); setSaving(false) }
    else router.push('/dashboard/sites')
  }

  const fieldStyle = { ...inputStyle, boxSizing: 'border-box' as const }

  if (loading) return <div style={{ padding: '2rem', fontFamily: F.en, color: C.textMid }}>Loading...</div>

  return (
    <div style={{ padding: '2rem', maxWidth: 560, margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <a href='/dashboard/sites' style={{ color: C.textLight, fontSize: 13, textDecoration: 'none', fontFamily: F.en }}>
          {lang === 'ar' ? 'رجوع للمواقع' : 'Back to Sites'}
        </a>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0.5rem 0 0', color: C.navy, fontFamily: F.en }}>
          {lang === 'ar' ? 'تعديل الموقع' : 'Edit Site'}
        </h1>
      </div>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div>
          <label style={labelStyle}>Site Name (English) *</label>
          <input name='name' value={form.name} onChange={handleChange} required style={fieldStyle} />
        </div>
        <div>
          <label style={labelStyle}>{lang === 'ar' ? 'اسم الموقع (عربي)' : 'Site Name (Arabic)'}</label>
          <input name='name_ar' value={form.name_ar} onChange={handleChange} placeholder='اختياري' style={{ ...fieldStyle, direction: 'rtl', textAlign: 'right' }} />
        </div>
        <div>
          <label style={labelStyle}>{lang === 'ar' ? 'المدينة' : 'City'}</label>
          <input name='city' value={form.city} onChange={handleChange} style={fieldStyle} />
        </div>
        <div>
          <label style={labelStyle}>{lang === 'ar' ? 'العنوان' : 'Address'}</label>
          <input name='address' value={form.address} onChange={handleChange} style={fieldStyle} />
        </div>
        {error && <p style={{ color: C.danger, fontSize: 13, margin: 0, fontFamily: F.en }}>{error}</p>}
        <div style={{ display: 'flex', gap: 10 }}>
          <button type='submit' disabled={saving} style={{ ...primaryBtn, flex: 1, opacity: saving ? 0.7 : 1, cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? (lang === 'ar' ? 'جاري الحفظ...' : 'Saving...') : (lang === 'ar' ? 'حفظ التغييرات' : 'Save Changes')}
          </button>
          <a href='/dashboard/sites' style={{ flex: 1 }}>
            <button type='button' style={{ ...secondaryBtn, width: '100%' }}>
              {lang === 'ar' ? 'إلغاء' : 'Cancel'}
            </button>
          </a>
        </div>
      </form>
    </div>
  )
}
