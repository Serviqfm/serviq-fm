'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useLanguage } from '@/context/LanguageContext'
import { useFieldConfig } from '@/lib/useFieldConfig'
import { isSystemRequired } from '@/lib/field-catalog'

export default function NewUserPage() {
  const { t, lang } = useLanguage()
  const supabase = createClient()
  const { isHidden, isRequired, loading: configLoading } = useFieldConfig('users_new')
  const isReq = (key: string) => isRequired(key) || isSystemRequired('users_new', key)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [orgId, setOrgId] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [form, setForm] = useState({
    full_name: '',
    full_name_ar: '',
    email: '',
    role: 'technician',
    phone: '',
    job_title: '',
    hourly_rate: '',
  })
  const [skillCategories, setSkillCategories] = useState<string[]>([])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadOrg() }, [])

  async function loadOrg() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile } = await supabase.from('users').select('organisation_id, role').eq('id', user.id).single()
    if (profile) { setOrgId(profile.organisation_id); setIsAdmin(profile.role === 'admin') }
  }

  // Fixed WO category list (mirrors work-orders page); used for skill categories.
  const CATEGORIES = ['HVAC', 'Electrical', 'Plumbing', 'Elevator / Lift', 'Fire Safety', 'Furniture', 'Kitchen Equipment', 'Pool / Gym', 'IT Equipment', 'Signage', 'Vehicle', 'Other']
  function toggleCategory(c: string) {
    setSkillCategories(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c])
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
        job_title: form.job_title,
        hourly_rate: form.hourly_rate,
        skill_categories: skillCategories,
        organisation_id: orgId,
      }),
    })

    const data = await res.json()

    if (!res.ok) {
      setError(data.error ?? 'Failed to create user')
      setLoading(false)
      return
    }

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
        <div style={{ background: '#e3f2fd', border: '1px solid #90caf9', borderRadius: 8, padding: '12px 16px' }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: '#1565c0', margin: '0 0 6px' }}>{lang === 'ar' ? 'تم إرسال دعوة عبر البريد الإلكتروني' : 'Invitation email sent'}</p>
          <p style={{ fontSize: 13, margin: 0, color: '#333' }}>
            {lang === 'ar'
              ? <>أُرسلت كلمة مرور مؤقتة إلى <strong>{form.email}</strong>. سيُطلب منه تعيين كلمة مرور جديدة عند أول تسجيل دخول.</>
              : <>A temporary password was emailed to <strong>{form.email}</strong>. They&apos;ll be prompted to set a new password on first login.</>}
          </p>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <a href='/dashboard/users'>
          <button style={{ padding: '9px 24px', background: '#1a1a2e', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 500 }}>{lang === 'ar' ? 'عرض المستخدمين' : 'View All Users'}</button>
        </a>
        <button
          onClick={() => { setSuccess(false); setForm({ full_name: '', full_name_ar: '', email: '', role: 'technician', phone: '', job_title: '', hourly_rate: '' }); setSkillCategories([]) }}
          style={{ padding: '9px 24px', background: 'white', color: '#333', border: '1px solid #ddd', borderRadius: 8, cursor: 'pointer', fontWeight: 500 }}
        >
          Add Another
        </button>
      </div>
    </div>
  )

  if (configLoading) return <div style={{ padding: '2rem' }}>Loading...</div>

  const reqMark = (key: string) => isReq(key) ? <span style={{ color: '#d32f2f' }}> *</span> : null

  return (
    <div style={{ padding: '2rem', maxWidth: 560, margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <a href='/dashboard/users' style={{ color: '#999', fontSize: 13, textDecoration: 'none' }}>{lang === 'ar' ? 'رجوع للمستخدمين' : 'Back to Users'}</a>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0.5rem 0 0' }}>{lang === 'ar' ? 'إضافة مستخدم جديد' : 'Add New User'}</h1>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {!isHidden('full_name') && (
          <div>
            <label style={labelStyle}>Full Name (English){reqMark('full_name')}</label>
            <input name='full_name' value={form.full_name} onChange={handleChange} required={isReq('full_name')} placeholder='e.g. Ahmed Al-Rashidi' style={fieldStyle} />
          </div>
        )}
        {!isHidden('full_name_ar') && (
          <div>
            <label style={labelStyle}>{lang === 'ar' ? 'الاسم بالعربية' : 'Full Name (Arabic)'}{reqMark('full_name_ar')}</label>
            <input name='full_name_ar' value={form.full_name_ar} onChange={handleChange} required={isReq('full_name_ar')} placeholder='الاسم الكامل' style={{ ...fieldStyle, direction: 'rtl', textAlign: 'right' }} />
          </div>
        )}
        {!isHidden('email') && (
          <div>
            <label style={labelStyle}>Email Address{reqMark('email')}</label>
            <input name='email' type='email' value={form.email} onChange={handleChange} required={isReq('email')} placeholder='ahmed@company.com' style={fieldStyle} />
          </div>
        )}
        {!isHidden('phone') && (
          <div>
            <label style={labelStyle}>{lang === 'ar' ? 'رقم الهاتف' : 'Phone Number'}{reqMark('phone')}</label>
            <input name='phone' value={form.phone} onChange={handleChange} required={isReq('phone')} placeholder='+966 5x xxx xxxx' style={fieldStyle} />
          </div>
        )}
        {!isHidden('role') && (
          <div>
            <label style={labelStyle}>Role{reqMark('role')}</label>
            <select name='role' value={form.role} onChange={handleChange} required={isReq('role')} style={fieldStyle}>
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
        )}
        <div>
          <label style={labelStyle}>{lang === 'ar' ? 'المسمى الوظيفي' : 'Job Title'}</label>
          <input name='job_title' value={form.job_title} onChange={handleChange} placeholder={lang === 'ar' ? 'مثال: فني تكييف' : 'e.g. HVAC Technician'} style={fieldStyle} />
        </div>
        {isAdmin && (
          <div>
            <label style={labelStyle}>{lang === 'ar' ? 'الأجر بالساعة' : 'Hourly Rate'}</label>
            <input name='hourly_rate' type='number' min='0' step='0.01' value={form.hourly_rate} onChange={handleChange} placeholder='0.00' style={fieldStyle} />
            <p style={{ fontSize: 12, color: '#666', margin: '6px 0 0' }}>{lang === 'ar' ? 'يُستخدم لحساب تكلفة العمالة في الفواتير.' : 'Used to compute labor charges on invoices.'}</p>
          </div>
        )}
        <div>
          <label style={labelStyle}>{lang === 'ar' ? 'فئات المهارة' : 'Skill Categories'}</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {CATEGORIES.map(c => {
              const on = skillCategories.includes(c)
              return (
                <button type='button' key={c} onClick={() => toggleCategory(c)}
                  style={{ padding: '5px 12px', borderRadius: 16, fontSize: 12, cursor: 'pointer', border: on ? '1px solid #1a1a2e' : '1px solid #ddd', background: on ? '#1a1a2e' : 'white', color: on ? 'white' : '#444' }}>
                  {c}
                </button>
              )
            })}
          </div>
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
