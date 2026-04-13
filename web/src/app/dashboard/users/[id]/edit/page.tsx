'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'

export default function EditUserPage() {
  const router = useRouter()
  const { id } = useParams()
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    full_name: '',
    full_name_ar: '',
    role: 'technician',
    is_active: true,
  })

  useEffect(() => { loadUser() }, [id])

  async function loadUser() {
    const { data } = await supabase.from('users').select('*').eq('id', id).single()
    if (data) setForm({
      full_name: data.full_name ?? '',
      full_name_ar: data.full_name_ar ?? '',
      role: data.role ?? 'technician',
      is_active: data.is_active !== false,
    })
    setLoading(false)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const val = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value
    setForm(prev => ({ ...prev, [e.target.name]: val }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const { error: updateError } = await supabase.from('users').update({
      full_name: form.full_name,
      full_name_ar: form.full_name_ar || null,
      role: form.role,
      is_active: form.is_active,
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    if (updateError) { setError(updateError.message); setSaving(false) }
    else router.push('/dashboard/users')
  }

  const fieldStyle = { width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' as const, background: 'white' }
  const labelStyle = { display: 'block' as const, marginBottom: 6, fontSize: 13, fontWeight: 500 as const, color: '#444' }

  const roleDescriptions: Record<string, string> = {
    admin: 'Full access — manages users, billing, all settings',
    manager: 'Creates WOs, manages assets and PMs, approves completions',
    technician: 'Views and updates their own assigned work orders via mobile',
    requester: 'Submit-only access — can raise maintenance requests',
  }

  if (loading) return <div style={{ padding: '2rem' }}>Loading...</div>

  return (
    <div style={{ padding: '2rem', maxWidth: 500, margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <a href='/dashboard/users' style={{ color: '#999', fontSize: 13, textDecoration: 'none' }}>Back to Users</a>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0.5rem 0 0' }}>Edit User</h1>
      </div>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div>
          <label style={labelStyle}>Full Name (English) *</label>
          <input name='full_name' value={form.full_name} onChange={handleChange} required style={fieldStyle} />
        </div>
        <div>
          <label style={labelStyle}>Full Name (Arabic)</label>
          <input name='full_name_ar' value={form.full_name_ar} onChange={handleChange} style={{ ...fieldStyle, direction: 'rtl', textAlign: 'right' }} />
        </div>
        <div>
          <label style={labelStyle}>Role *</label>
          <select name='role' value={form.role} onChange={handleChange} style={fieldStyle}>
            <option value='technician'>Technician</option>
            <option value='manager'>Manager</option>
            <option value='requester'>Requester</option>
            <option value='admin'>Admin</option>
          </select>
          {form.role && (
            <p style={{ fontSize: 12, color: '#666', margin: '6px 0 0', background: '#f9f9f9', padding: '8px 12px', borderRadius: 6 }}>
              {roleDescriptions[form.role]}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#f9f9f9', borderRadius: 8, padding: '12px 16px' }}>
          <input type='checkbox' name='is_active' id='is_active' checked={form.is_active} onChange={handleChange} style={{ width: 16, height: 16 }} />
          <label htmlFor='is_active' style={{ fontSize: 13, fontWeight: 500, color: '#444', cursor: 'pointer' }}>
            User is active — can log in and use the platform
          </label>
        </div>
        {error && (
          <div style={{ background: '#fce4ec', border: '1px solid #ef9a9a', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#b71c1c' }}>
            {error}
          </div>
        )}
        <div style={{ display: 'flex', gap: 10 }}>
          <button type='submit' disabled={saving} style={{ flex: 1, background: '#1a1a2e', color: 'white', padding: '11px', borderRadius: 8, border: 'none', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 500, fontSize: 15, opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          <a href='/dashboard/users' style={{ flex: 1 }}>
            <button type='button' style={{ width: '100%', background: 'white', color: '#333', padding: '11px', borderRadius: 8, border: '1px solid #ddd', cursor: 'pointer', fontWeight: 500, fontSize: 15 }}>Cancel</button>
          </a>
        </div>
      </form>
    </div>
  )
}