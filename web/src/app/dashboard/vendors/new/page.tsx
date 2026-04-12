'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function NewVendorPage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    company_name: '',
    company_name_ar: '',
    contact_name: '',
    phone: '',
    email: '',
    specialisation: '',
    vat_number: '',
    cr_number: '',
  })

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
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
    const { error: insertError } = await supabase.from('vendors').insert({
      company_name: form.company_name,
      company_name_ar: form.company_name_ar || null,
      contact_name: form.contact_name || null,
      phone: form.phone || null,
      email: form.email || null,
      specialisation: form.specialisation || null,
      vat_number: form.vat_number || null,
      cr_number: form.cr_number || null,
      organisation_id: profile.organisation_id,
      is_active: true,
    })
    if (insertError) { setError(insertError.message); setLoading(false) }
    else router.push('/dashboard/vendors')
  }

  const fieldStyle = { width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' as const, background: 'white' }
  const labelStyle = { display: 'block' as const, marginBottom: 6, fontSize: 13, fontWeight: 500 as const, color: '#444' }

  return (
    <div style={{ padding: '2rem', maxWidth: 600, margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <a href='/dashboard/vendors' style={{ color: '#999', fontSize: 13, textDecoration: 'none' }}>Back to Vendors</a>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0.5rem 0 0' }}>Add New Vendor</h1>
      </div>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div>
          <label style={labelStyle}>Company Name (English) *</label>
          <input name='company_name' value={form.company_name} onChange={handleChange} required placeholder='e.g. Al Faris Technical Services' style={fieldStyle} />
        </div>
        <div>
          <label style={labelStyle}>Company Name (Arabic)</label>
          <input name='company_name_ar' value={form.company_name_ar} onChange={handleChange} placeholder='اسم الشركة بالعربية' style={{ ...fieldStyle, direction: 'rtl', textAlign: 'right' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>Contact Name</label>
            <input name='contact_name' value={form.contact_name} onChange={handleChange} placeholder='e.g. Ahmed Al-Rashid' style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>Phone</label>
            <input name='phone' value={form.phone} onChange={handleChange} placeholder='e.g. +966 50 000 0000' style={fieldStyle} />
          </div>
        </div>
        <div>
          <label style={labelStyle}>Email</label>
          <input name='email' type='email' value={form.email} onChange={handleChange} placeholder='e.g. info@vendor.com' style={fieldStyle} />
        </div>
        <div>
          <label style={labelStyle}>Specialisation</label>
          <select name='specialisation' value={form.specialisation} onChange={handleChange} style={fieldStyle}>
            <option value=''>Select specialisation</option>
            <option value='HVAC'>HVAC</option>
            <option value='Electrical'>Electrical</option>
            <option value='Plumbing'>Plumbing</option>
            <option value='Elevator / Lift'>Elevator / Lift</option>
            <option value='Fire Safety'>Fire Safety</option>
            <option value='Civil / Construction'>Civil / Construction</option>
            <option value='Cleaning'>Cleaning</option>
            <option value='Landscaping'>Landscaping</option>
            <option value='IT / AV'>IT / AV</option>
            <option value='Security'>Security</option>
            <option value='General Maintenance'>General Maintenance</option>
            <option value='Other'>Other</option>
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>VAT Number</label>
            <input name='vat_number' value={form.vat_number} onChange={handleChange} placeholder='e.g. 300000000000003' style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>CR Number</label>
            <input name='cr_number' value={form.cr_number} onChange={handleChange} placeholder='e.g. 1010000000' style={fieldStyle} />
          </div>
        </div>
        {error && <p style={{ color: 'red', fontSize: 13, margin: 0 }}>{error}</p>}
        <button type='submit' disabled={loading} style={{ background: '#1a1a2e', color: 'white', padding: '11px', borderRadius: 8, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 500, fontSize: 15, opacity: loading ? 0.7 : 1 }}>
          {loading ? 'Saving...' : 'Save Vendor'}
        </button>
      </form>
    </div>
  )
}