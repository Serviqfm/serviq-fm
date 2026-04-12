'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function NewPMSchedulePage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [assets, setAssets] = useState<any[]>([])
  const [sites, setSites] = useState<any[]>([])
  const [technicians, setTechnicians] = useState<any[]>([])
  const [form, setForm] = useState({
    title: '',
    description: '',
    frequency: 'monthly',
    asset_id: '',
    site_id: '',
    assigned_to: '',
    next_due_at: '',
    estimated_duration_minutes: '',
  })

  useEffect(() => { loadFormData() }, [])

  async function loadFormData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
    if (!profile) return
    const orgId = profile.organisation_id
    const [{ data: assetData }, { data: siteData }, { data: techData }] = await Promise.all([
      supabase.from('assets').select('id, name').eq('organisation_id', orgId).eq('status', 'active'),
      supabase.from('sites').select('id, name').eq('organisation_id', orgId).eq('is_active', true),
      supabase.from('users').select('id, full_name').eq('organisation_id', orgId).in('role', ['technician', 'manager']),
    ])
    if (assetData) setAssets(assetData)
    if (siteData) setSites(siteData)
    if (techData) setTechnicians(techData)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
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
    const { error: insertError } = await supabase.from('pm_schedules').insert({
      title: form.title,
      description: form.description || null,
      frequency: form.frequency,
      asset_id: form.asset_id || null,
      site_id: form.site_id || null,
      assigned_to: form.assigned_to || null,
      next_due_at: form.next_due_at || null,
      estimated_duration_minutes: form.estimated_duration_minutes ? parseInt(form.estimated_duration_minutes) : null,
      organisation_id: profile.organisation_id,
      is_active: true,
    })
    if (insertError) { setError(insertError.message); setLoading(false) }
    else router.push('/dashboard/pm-schedules')
  }

  const fieldStyle = { width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' as const, background: 'white' }
  const labelStyle = { display: 'block' as const, marginBottom: 6, fontSize: 13, fontWeight: 500 as const, color: '#444' }

  const templates = [
    { label: 'AC Filter Cleaning', description: 'Clean and replace AC filters, check refrigerant levels, inspect coils' },
    { label: 'Fire Safety Check', description: 'Inspect fire extinguishers, check expiry dates, test fire alarm panel' },
    { label: 'Elevator Service', description: 'Monthly elevator inspection, lubrication, safety test and logbook update' },
    { label: 'Pool Chemical Check', description: 'Test pH and chlorine levels, add chemicals as required, inspect pump and filter' },
    { label: 'Generator Test Run', description: 'Run generator for 30 minutes under load, check fuel level and battery' },
    { label: 'Refrigeration PM', description: 'Check temperature logs, clean condenser coils, inspect door seals' },
  ]

  return (
    <div style={{ padding: '2rem', maxWidth: 680, margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <a href='/dashboard/pm-schedules' style={{ color: '#999', fontSize: 13, textDecoration: 'none' }}>Back to PM Schedules</a>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0.5rem 0 0' }}>New PM Schedule</h1>
      </div>

      <div style={{ marginBottom: '1.5rem' }}>
        <p style={{ fontSize: 13, fontWeight: 500, marginBottom: 8, color: '#444' }}>Quick templates</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {templates.map(t => (
            <button key={t.label} type='button' onClick={() => setForm(prev => ({ ...prev, title: t.label, description: t.description }))} style={{ padding: '5px 12px', borderRadius: 20, border: '1px solid #ddd', background: 'white', cursor: 'pointer', fontSize: 12, color: '#444' }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div>
          <label style={labelStyle}>Schedule Title *</label>
          <input name='title' value={form.title} onChange={handleChange} required placeholder='e.g. Monthly AC Filter Cleaning' style={fieldStyle} />
        </div>
        <div>
          <label style={labelStyle}>Task Description</label>
          <textarea name='description' value={form.description} onChange={handleChange} rows={3} placeholder='Describe what needs to be done...' style={{ ...fieldStyle, resize: 'vertical' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>Frequency *</label>
            <select name='frequency' value={form.frequency} onChange={handleChange} style={fieldStyle}>
              <option value='daily'>Daily</option>
              <option value='weekly'>Weekly</option>
              <option value='fortnightly'>Fortnightly (Every 2 weeks)</option>
              <option value='fortnightly'>Fortnightly (Every 2 weeks)</option>
              <option value='monthly'>Monthly</option>
              <option value='quarterly'>Quarterly</option>
              <option value='biannual'>Every 6 Months</option>
              <option value='annual'>Annual</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Estimated Duration (minutes)</label>
            <input name='estimated_duration_minutes' type='number' value={form.estimated_duration_minutes} onChange={handleChange} placeholder='e.g. 60' min='1' style={fieldStyle} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>Asset</label>
            <select name='asset_id' value={form.asset_id} onChange={handleChange} style={fieldStyle}>
              <option value=''>Select asset</option>
              {assets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Site</label>
            <select name='site_id' value={form.site_id} onChange={handleChange} style={fieldStyle}>
              <option value=''>Select site</option>
              {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>Assign To</label>
            <select name='assigned_to' value={form.assigned_to} onChange={handleChange} style={fieldStyle}>
              <option value=''>Unassigned</option>
              {technicians.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>First Due Date *</label>
            <input name='next_due_at' type='datetime-local' value={form.next_due_at} onChange={handleChange} required style={fieldStyle} />
          </div>
        </div>
        <div style={{ background: '#f0f7ff', border: '1px solid #b3d4f5', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#1565c0' }}>
          When this schedule is due, click Generate WO on the schedules list to create a work order automatically.
        </div>
        {error && <p style={{ color: 'red', fontSize: 13, margin: 0 }}>{error}</p>}
        <button type='submit' disabled={loading} style={{ background: '#1a1a2e', color: 'white', padding: '11px', borderRadius: 8, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 500, fontSize: 15, opacity: loading ? 0.7 : 1 }}>
          {loading ? 'Saving...' : 'Create PM Schedule'}
        </button>
      </form>
    </div>
  )
}