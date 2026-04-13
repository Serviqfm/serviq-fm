'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/context/LanguageContext'

export default function NewUserPage() {
  const router = useRouter()
  const { t, lang } = useLanguage()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [tempPassword, setTempPassword] = useState('')
  const [orgId, setOrgId] = useState('')
  const [form, setForm] = useState({
    full_name: '',
    full_name_ar: '',
    email: '',
    role: 'technician',
    phone: '',
  })

  useEffect(() => { loadOrg() }, [])

  async function loadOrg() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile } = await supabase.from('users').select('organisation_id, role').eq('id', user.id).single()
    if (profile) setOrgId(profile.organisation_id)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    if (!orgId) { setError('Organisation not found'); setLoading(false); return }

    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: form.email,
        full_name: form.full_name,
        full_name_ar: form.full_name_ar,
        role: form.role,
        phone: form.phone,
        organisation_id: orgId,
      }),
    })

    const data = await res.json()

    if (!res.ok) {
      setError(data.error ?? 'Failed to create user')
      setLoading(false)
      return
    }

    setTempPassword(data.tempPassword)
    setSuccess(true)
    setLoading(false)
  }

  const fieldStyle = {
    width: '100%', padding: '8px 12px', border: '1px solid #ddd',
    borderRadius: 8, fontSize: 14, boxSizing: 'border-box' as const, background: 'white'
  }
  const labelStyle = {
    display: 'block' as const, marginBottom: 6,
    fontSize: 13, fontWeight: 500 as const, color: '#444'
  }

  const roleDescriptions: Record<string, string> = {
    admin: 'Full access — manages users, billing, all settings',
    manager: 'Creates WOs, manages assets and PMs, approves completions',
    technician: 'Views and updates their assigned work orders via mobile app',
    requester: 'Submit-only access — can raise maintenance requests',
  }

  if (success) return (
    <div style={{ padding: '2rem', maxWidth: 520, margin: '0 auto' }}>
      <div style={{ background: '#e8f5e9', border: '1px solid #a5d6a7', borderRadius: 12, padding: '1.5rem', marginBottom: '1.5rem' }}>
        <p style={{ fontSize: 18, fontWeight: 600, color: '#2e7d32', margin: '0 0 8px' }}>{lang === 'ar' ? 'تم إنشاء المستخدم' : 'User Created Successfully'}</p>
        <p style={{ fontSize: 14, color: '#333', margin: '0 0 16px' }}>
          <strong>{form.full_name}</strong> has been added as a <strong>{form.role}</strong>.
        </p>
        <div style={{ background: '#fff8e1', border: '1px solid #ffe082', borderRadius: 8, padding: '12px 16px' }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: '#f57f17', margin: '0 0 8px' }}>Share these login details with {form.full_name}</p>
          <p style={{ fontSize: 13, margin: '0 0 4px' }}>Email: <strong>{form.email}</strong></p>
          <p style={{ fontSize: 13, margin: '0 0 8px' }}>Temporary Password: <strong style={{ fontFamily: 'monospace', background: '#f5f5f5', padding: '2px 6px', borderRadius: 4 }}>{tempPassword}</strong></p>
          <p style={{ fontSize: 12, color: '#666', margin: 0 }}>Ask them to change their password after first login.</p>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <a href='/dashboard/users'>
          <button style={{ padding: '9px 24px', background: '#1a1a2e', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 500 }}>{lang === 'ar' ? 'عرض المستخدمين' : 'View All Users'}</button>
        </a>
        <button
          onClick={() => { setSuccess(false); setTempPassword(''); setForm({ full_name: '', full_name_ar: '', email: '', role: 'technician', phone: '' }) }}
          style={{ padding: '9px 24px', background: 'white', color: '#333', border: '1px solid #ddd', borderRadius: 8, cursor: 'pointer', fontWeight: 500 }}
        >
          Add Another
        </button>
      </div>
    </div>
  )

  return (
    <div style={{ padding: '2rem', maxWidth: 560, margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <a href='/dashboard/users' style={{ color: '#999', fontSize: 13, textDecoration: 'none' }}>{lang === 'ar' ? 'رجوع للمستخدمين' : 'Back to Users'}</a>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0.5rem 0 0' }}>{lang === 'ar' ? 'إضافة مستخدم جديد' : 'Add New User'}</h1>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div>
          <label style={labelStyle}>Full Name (English) *</label>
          <input name='full_name' value={form.full_name} onChange={handleChange} required placeholder='e.g. Ahmed Al-Rashidi' style={fieldStyle} />
        </div>
        <div>
          <label style={labelStyle}>{lang === 'ar' ? 'الاسم بالعربية' : 'Full Name (Arabic)'}</label>
          <input name='full_name_ar' value={form.full_name_ar} onChange={handleChange} placeholder='الاسم الكامل' style={{ ...fieldStyle, direction: 'rtl', textAlign: 'right' }} />
        </div>
        <div>
          <label style={labelStyle}>Email Address *</label>
          <input name='email' type='email' value={form.email} onChange={handleChange} required placeholder='ahmed@company.com' style={fieldStyle} />
        </div>
        <div>
          <label style={labelStyle}>{lang === 'ar' ? 'رقم الهاتف' : 'Phone Number'}</label>
          <input name='phone' value={form.phone} onChange={handleChange} placeholder='+966 5x xxx xxxx' style={fieldStyle} />
        </div>
        <div>
          <label style={labelStyle}>Role *</label>
          <select name='role' value={form.role} onChange={handleChange} style={fieldStyle}>
            <option value='technician'>{lang === 'ar' ? 'فني' : 'Technician'}</option>
            <option value='manager'>{lang === 'ar' ? 'مدير' : 'Manager'}</option>
            <option value='requester'>{lang === 'ar' ? 'مقدم طلب' : 'Requester'}</option>
            <option value='admin'>{lang === 'ar' ? 'مدير النظام' : 'Admin'}</option>
          </select>
          {form.role && (
            <p style={{ fontSize: 12, color: '#666', margin: '6px 0 0', background: '#f9f9f9', padding: '8px 12px', borderRadius: 6 }}>
              {roleDescriptions[form.role]}
            </p>
          )}
        </div>
        {error && (
          <div style={{ background: '#fce4ec', border: '1px solid #ef9a9a', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#b71c1c' }}>
            {error}
          </div>
        )}
        <button type='submit' disabled={loading} style={{ background: '#1a1a2e', color: 'white', padding: '11px', borderRadius: 8, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 500, fontSize: 15, opacity: loading ? 0.7 : 1 }}>
          {loading ? t('common.saving') : t('common.save')}
        </button>
      </form>
    </div>
  )
}