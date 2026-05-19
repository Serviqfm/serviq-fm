'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/context/LanguageContext'
import { useFieldConfig } from '@/lib/useFieldConfig'
import { isSystemRequired } from '@/lib/field-catalog'

export default function NewSitePage() {
  const router = useRouter()
  const { lang } = useLanguage()
  const { isHidden, isRequired, loading: configLoading } = useFieldConfig('sites_new')
  const isReq = (key: string) => isRequired(key) || isSystemRequired('sites_new', key)
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
    const res = await fetch('/api/sites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name,
        name_ar: form.name_ar,
        address: form.address,
        city: form.city,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(data?.error ?? 'Failed to create site')
      setLoading(false)
      return
    }
    router.push('/dashboard/sites')
  }

  const fieldStyle = { width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' as const, background: 'white' }
  const labelStyle = { display: 'block' as const, marginBottom: 6, fontSize: 13, fontWeight: 500 as const, color: '#444' }

  if (configLoading) return <div className="p-8 text-on-surface-variant">{lang === 'ar' ? 'جارٍ التحميل...' : 'Loading form…'}</div>

  const reqMark = (key: string) => isReq(key) ? <span style={{ color: '#d32f2f' }}> *</span> : null

  return (
    <div style={{ padding: '2rem', maxWidth: 560, margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <a href='/dashboard/sites' style={{ color: '#999', fontSize: 13, textDecoration: 'none' }}>{lang === 'ar' ? 'رجوع للمواقع' : 'Back to Sites'}</a>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0.5rem 0 0' }}>{lang === 'ar' ? 'إضافة موقع جديد' : 'Add New Site'}</h1>
      </div>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {!isHidden('name') && (
          <div>
            <label style={labelStyle}>{lang === 'ar' ? 'اسم الموقع (إنجليزي)' : 'Site Name (English)'}{reqMark('name')}</label>
            <input name='name' value={form.name} onChange={handleChange} required={isReq('name')} placeholder='e.g. Riyadh Head Office' style={fieldStyle} />
          </div>
        )}
        {!isHidden('name_ar') && (
          <div>
            <label style={labelStyle}>{lang === 'ar' ? 'اسم الموقع (عربي)' : 'Site Name (Arabic)'}{reqMark('name_ar')}</label>
            <input name='name_ar' value={form.name_ar} onChange={handleChange} required={isReq('name_ar')} placeholder='e.g. المكتب الرئيسي' style={{ ...fieldStyle, direction: 'rtl', textAlign: 'right' }} />
          </div>
        )}
        {!isHidden('city') && (
          <div>
            <label style={labelStyle}>{lang === 'ar' ? 'المدينة' : 'City'}{reqMark('city')}</label>
            <input name='city' value={form.city} onChange={handleChange} required={isReq('city')} placeholder='e.g. Riyadh' style={fieldStyle} />
          </div>
        )}
        {!isHidden('address') && (
          <div>
            <label style={labelStyle}>{lang === 'ar' ? 'العنوان' : 'Address'}{reqMark('address')}</label>
            <input name='address' value={form.address} onChange={handleChange} required={isReq('address')} placeholder='e.g. King Fahd Road, Al Olaya District' style={fieldStyle} />
          </div>
        )}
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
