import os

os.makedirs('src/app/api/users', exist_ok=True)

# API route that uses service role key to create auth user + profile
api_route = """import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { email, full_name, full_name_ar, role, phone, organisation_id } = await req.json()

    if (!email || !full_name || !role || !organisation_id) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Use service role key to create auth user
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Create auth user with a temporary password
    const tempPassword = 'Serviq' + Math.random().toString(36).slice(2, 10) + '!1'
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
    })

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 })
    }

    // Create user profile record
    const { error: profileError } = await supabaseAdmin.from('users').insert({
      id: authData.user.id,
      email,
      full_name,
      full_name_ar: full_name_ar || null,
      role,
      phone: phone || null,
      organisation_id,
      is_active: true,
      invited_at: new Date().toISOString(),
    })

    if (profileError) {
      // Rollback auth user
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
      return NextResponse.json({ error: profileError.message }, { status: 400 })
    }

    return NextResponse.json({ 
      success: true, 
      userId: authData.user.id,
      tempPassword,
    })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}"""

with open('src/app/api/users/route.ts', 'w', encoding='utf-8') as f:
    f.write(api_route)
print('API route written')

# Update new user page to call API route instead of supabase directly
new_page = """'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function NewUserPage() {
  const router = useRouter()
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
        <p style={{ fontSize: 18, fontWeight: 600, color: '#2e7d32', margin: '0 0 8px' }}>User Created Successfully</p>
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
          <button style={{ padding: '9px 24px', background: '#1a1a2e', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 500 }}>View All Users</button>
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
        <a href='/dashboard/users' style={{ color: '#999', fontSize: 13, textDecoration: 'none' }}>Back to Users</a>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0.5rem 0 0' }}>Add New User</h1>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div>
          <label style={labelStyle}>Full Name (English) *</label>
          <input name='full_name' value={form.full_name} onChange={handleChange} required placeholder='e.g. Ahmed Al-Rashidi' style={fieldStyle} />
        </div>
        <div>
          <label style={labelStyle}>Full Name (Arabic)</label>
          <input name='full_name_ar' value={form.full_name_ar} onChange={handleChange} placeholder='الاسم الكامل' style={{ ...fieldStyle, direction: 'rtl', textAlign: 'right' }} />
        </div>
        <div>
          <label style={labelStyle}>Email Address *</label>
          <input name='email' type='email' value={form.email} onChange={handleChange} required placeholder='ahmed@company.com' style={fieldStyle} />
        </div>
        <div>
          <label style={labelStyle}>Phone Number</label>
          <input name='phone' value={form.phone} onChange={handleChange} placeholder='+966 5x xxx xxxx' style={fieldStyle} />
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
        {error && (
          <div style={{ background: '#fce4ec', border: '1px solid #ef9a9a', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#b71c1c' }}>
            {error}
          </div>
        )}
        <button type='submit' disabled={loading} style={{ background: '#1a1a2e', color: 'white', padding: '11px', borderRadius: 8, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 500, fontSize: 15, opacity: loading ? 0.7 : 1 }}>
          {loading ? 'Creating User...' : 'Create User'}
        </button>
      </form>
    </div>
  )
}"""

with open('src/app/dashboard/users/new/page.tsx', 'w', encoding='utf-8') as f:
    f.write(new_page)
print('New user page updated to use API route')
print('All files written')