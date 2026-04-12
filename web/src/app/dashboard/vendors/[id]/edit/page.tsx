'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'

export default function EditVendorPage() {
  const router = useRouter()
  const { id } = useParams()
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    company_name: '', company_name_ar: '', contact_name: '',
    phone: '', email: '', specialisation: '', vat_number: '', cr_number: '',
  })

  useEffect(() => { loadVendor() }, [id])

  async function loadVendor() {
    const { data } = await supabase.from('vendors').select('*').eq('id', id).single()
    if (data) setForm({
      company_name: data.company_name ?? '',
      company_name_ar: data.company_name_ar ?? '',
      contact_name: data.contact_name ?? '',
      phone: data.phone ?? '',
      email: data.email ?? '',
      specialisation: data.specialisation ?? '',
      vat_number: data.vat_number ?? '',
      cr_number: data.cr_number ?? '',
    })
    setLoading(false)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const { error: updateError } = await supabase.from('vendors').update({
      company_name: form.company_name,
      company_name_ar: form.company_name_ar || null,
      contact_name: form.contact_name || null,
      phone: form.phone || null,
      email: form.email || null,
      specialisation: form.specialisation || null,
      vat_number: form.vat_number || null,
      cr_number: form.cr_number || null,
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    if (updateError) { setError(updateError.message); setSaving(false) }
    else router.push('/dashboard/vendors/' + id)
  }

  const fieldStyle = { width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' as const, background: 'white' }
  const labelStyle = { display: 'block' as const, marginBottom: 6, fontSize: 13, fontWeight: 500 as const, color: '#444' }

  if (loading) return <div style={{ padding: '2rem' }}>Loading...</div>

  return (
    <div style={{ padding: '2rem', maxWidth: 600, margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <a href={'/dashboard/vendors/' + id} style={{ color: '#999', fontSize: 13, textDecoration: 'none' }}>Back to Vendor</a>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0.5rem 0 0' }}>Edit Vendor</h1>
      </div>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div>
          <label style={labelStyle}>Company Name (English) *</label>
          <input name='company_name' value={form.company_name} onChange={handleChange} required style={fieldStyle} />
        </div>
        <div>
          <label style={labelStyle}>Company Name (Arabic)</label>
          <input name='company_name_ar' value={form.company_name_ar} onChange={handleChange} style={{ ...fieldStyle, direction: 'rtl', textAlign: 'right' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>Contact Name</label>
            <input name='contact_name' value={form.contact_name} onChange={handleChange} style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>Phone</label>
            <input name='phone' value={form.phone} onChange={handleChange} style={fieldStyle} />
          </div>
        </div>
        <div>
          <label style={labelStyle}>Email</label>
          <input name='email' type='email' value={form.email} onChange={handleChange} style={fieldStyle} />
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
            <input name='vat_number' value={form.vat_number} onChange={handleChange} style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>CR Number</label>
            <input name='cr_number' value={form.cr_number} onChange={handleChange} style={fieldStyle} />
          </div>
        </div>
        {error && <p style={{ color: 'red', fontSize: 13, margin: 0 }}>{error}</p>}
        <div style={{ display: 'flex', gap: 10 }}>
          <button type='submit' disabled={saving} style={{ flex: 1, background: '#1a1a2e', color: 'white', padding: '11px', borderRadius: 8, border: 'none', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 500, fontSize: 15, opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          <a href={'/dashboard/vendors/' + id} style={{ flex: 1 }}>
            <button type='button' style={{ width: '100%', background: 'white', color: '#333', padding: '11px', borderRadius: 8, border: '1px solid #ddd', cursor: 'pointer', fontWeight: 500, fontSize: 15 }}>Cancel</button>
          </a>
        </div>
      </form>
    </div>
  )
}