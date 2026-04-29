'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/context/LanguageContext'

export default function NewSitePage() {
  const router = useRouter()
  const { lang } = useLanguage()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    name: '',
    name_ar: '',
    address: '',
    city: '',
  })

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Not logged in'); setLoading(false); return }
    const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
    if (!profile) { setError('User profile not found'); setLoading(false); return }
    const { error: insertError } = await supabase.from('sites').insert({
      name: form.name,
      name_ar: form.name_ar || null,
      address: form.address || null,
      city: form.city || null,
      organisation_id: profile.organisation_id,
      is_active: true,
    })
    if (insertError) { setError(insertError.message); setLoading(false) }
    else router.push('/dashboard/sites')
  }

  const fieldStyle = { width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' as const, background: 'white' }
  const labelStyle = { display: 'block' as const, marginBottom: 6, fontSize: 13, fontWeight: 500 as const, color: '#444' }

  return (
    <div style={{ padding: '2rem', maxWidth: 560, margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <a href='/dashboard/sites' style={{ color: '#999', fontSize: 13, textDecoration: 'none' }}>{lang === 'ar' ? 'رجوع للمواقع' : 'Back to Sites'}</a>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0.5rem 0 0' }}>{lang === 'ar' ? 'إضافة موقع جديد' : 'Add New Site'}</h1>
      </div>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div>
          <label style={labelStyle}>Site Name (English) *</label>
          <input name='name' value={form.name} onChange={handleChange} required placeholder='e.g. Riyadh Head Office' style={fieldStyle} />
        </div>
        <div>
          <label style={labelStyle}>{lang === 'ar' ? 'اسم الموقع (عربي)' : 'Site Name (Arabic)'}</label>
          <input name='name_ar' value={form.name_ar} onChange={handleChange} placeholder='e.g. المكتب الرئيسي' style={{ ...fieldStyle, direction: 'rtl', textAlign: 'right' }} />
        </div>
        <div>
          <label style={labelStyle}>{lang === 'ar' ? 'المدينة' : 'City'}</label>
          <input name='city' value={form.city} onChange={handleChange} placeholder='e.g. Riyadh' style={fieldStyle} />
        </div>
        <div>
          <label style={labelStyle}>{lang === 'ar' ? 'العنوان' : 'Address'}</label>
          <input name='address' value={form.address} onChange={handleChange} placeholder='e.g. King Fahd Road, Al Olaya District' style={fieldStyle} />
        </div>
        <div style={{ background: '#f0f7ff', border: '1px solid #b3d4f5', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#1565c0' }}>
          Once added, this site will appear in the site dropdowns across Work Orders, Assets, and PM Schedules.
        </div>
        {error && <p style={{ color: 'red', fontSize: 13, margin: 0 }}>{error}</p>}
        <button type='submit' disabled={loading} style={{ background: '#1a1a2e', color: 'white', padding: '11px', borderRadius: 8, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 500, fontSize: 15, opacity: loading ? 0.7 : 1 }}>
          {loading ? 'Saving...' : 'Save Site'}
        </button>
      </form>
    </div>
  )
}