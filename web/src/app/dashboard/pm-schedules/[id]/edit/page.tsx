'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'

export default function EditPMSchedulePage() {
  const router = useRouter()
  const { id } = useParams()
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [assets, setAssets] = useState<any[]>([])
  const [sites, setSites] = useState<any[]>([])
  const [technicians, setTechnicians] = useState<any[]>([])
  const [form, setForm] = useState({
    title: '', description: '', frequency: 'monthly',
    asset_id: '', site_id: '', assigned_to: '',
    next_due_at: '', estimated_duration_minutes: '',
    is_seasonal: false, seasonal_start_month: '1', seasonal_end_month: '12',
  })

  useEffect(() => { loadData() }, [id])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
    if (!profile) return
    const orgId = profile.organisation_id
    const [{ data: pm }, { data: assetData }, { data: siteData }, { data: techData }] = await Promise.all([
      supabase.from('pm_schedules').select('*').eq('id', id).single(),
      supabase.from('assets').select('id, name').eq('organisation_id', orgId).eq('status', 'active'),
      supabase.from('sites').select('id, name').eq('organisation_id', orgId).eq('is_active', true),
      supabase.from('users').select('id, full_name').eq('organisation_id', orgId).in('role', ['technician', 'manager']),
    ])
    if (assetData) setAssets(assetData)
    if (siteData) setSites(siteData)
    if (techData) setTechnicians(techData)
    if (pm) setForm({
      title: pm.title ?? '',
      description: pm.description ?? '',
      frequency: pm.frequency ?? 'monthly',
      asset_id: pm.asset_id ?? '',
      site_id: pm.site_id ?? '',
      assigned_to: pm.assigned_to ?? '',
      next_due_at: pm.next_due_at ? pm.next_due_at.slice(0, 16) : '',
      estimated_duration_minutes: pm.estimated_duration_minutes ? String(pm.estimated_duration_minutes) : '',
      is_seasonal: pm.is_seasonal ?? false,
      seasonal_start_month: pm.seasonal_start_month ? String(pm.seasonal_start_month) : '1',
      seasonal_end_month: pm.seasonal_end_month ? String(pm.seasonal_end_month) : '12',
    })
    setLoading(false)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const { error: updateError } = await supabase.from('pm_schedules').update({
      title: form.title,
      description: form.description || null,
      frequency: form.frequency,
      asset_id: form.asset_id || null,
      site_id: form.site_id || null,
      assigned_to: form.assigned_to || null,
      next_due_at: form.next_due_at || null,
      estimated_duration_minutes: form.estimated_duration_minutes ? parseInt(form.estimated_duration_minutes) : null,
      is_seasonal: form.is_seasonal,
      seasonal_start_month: form.is_seasonal ? parseInt(form.seasonal_start_month) : null,
      seasonal_end_month: form.is_seasonal ? parseInt(form.seasonal_end_month) : null,
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    if (updateError) { setError(updateError.message); setSaving(false) }
    else router.push('/dashboard/pm-schedules')
  }

  const fieldStyle = { width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' as const, background: 'white' }
  const labelStyle = { display: 'block' as const, marginBottom: 6, fontSize: 13, fontWeight: 500 as const, color: '#444' }
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December']

  if (loading) return <div style={{ padding: '2rem' }}>Loading...</div>

  return (
    <div style={{ padding: '2rem', maxWidth: 680, margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <a href='/dashboard/pm-schedules' style={{ color: '#999', fontSize: 13, textDecoration: 'none' }}>Back to PM Schedules</a>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0.5rem 0 0' }}>Edit PM Schedule</h1>
      </div>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div>
          <label style={labelStyle}>Title *</label>
          <input name='title' value={form.title} onChange={handleChange} required style={fieldStyle} />
        </div>
        <div>
          <label style={labelStyle}>Description</label>
          <textarea name='description' value={form.description} onChange={handleChange} rows={3} style={{ ...fieldStyle, resize: 'vertical' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>Frequency *</label>
            <select name='frequency' value={form.frequency} onChange={handleChange} style={fieldStyle}>
              <option value='daily'>Daily</option>
              <option value='weekly'>Weekly</option>
              <option value='fortnightly'>Fortnightly</option>
              <option value='monthly'>Monthly</option>
              <option value='quarterly'>Quarterly</option>
              <option value='biannual'>Every 6 Months</option>
              <option value='annual'>Annual</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Duration (minutes)</label>
            <input name='estimated_duration_minutes' type='number' value={form.estimated_duration_minutes} onChange={handleChange} style={fieldStyle} />
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
            <label style={labelStyle}>Next Due Date</label>
            <input name='next_due_at' type='datetime-local' value={form.next_due_at} onChange={handleChange} style={fieldStyle} />
          </div>
        </div>
        <div style={{ background: '#f9f9f9', border: '1px solid #eee', borderRadius: 8, padding: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: form.is_seasonal ? 12 : 0 }}>
            <input type='checkbox' id='is_seasonal' checked={form.is_seasonal} onChange={e => setForm(prev => ({ ...prev, is_seasonal: e.target.checked }))} style={{ width: 16, height: 16 }} />
            <label htmlFor='is_seasonal' style={{ fontSize: 13, fontWeight: 500, color: '#444', cursor: 'pointer' }}>Seasonal schedule</label>
          </div>
          {form.is_seasonal && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 8 }}>
              <div>
                <label style={labelStyle}>Active from month</label>
                <select name='seasonal_start_month' value={form.seasonal_start_month} onChange={handleChange} style={fieldStyle}>
                  {months.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Active until month</label>
                <select name='seasonal_end_month' value={form.seasonal_end_month} onChange={handleChange} style={fieldStyle}>
                  {months.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
                </select>
              </div>
            </div>
          )}
        </div>
        {error && <p style={{ color: 'red', fontSize: 13, margin: 0 }}>{error}</p>}
        <div style={{ display: 'flex', gap: 10 }}>
          <button type='submit' disabled={saving} style={{ flex: 1, background: '#1a1a2e', color: 'white', padding: '11px', borderRadius: 8, border: 'none', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 500, fontSize: 15, opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          <a href='/dashboard/pm-schedules' style={{ flex: 1 }}>
            <button type='button' style={{ width: '100%', background: 'white', color: '#333', padding: '11px', borderRadius: 8, border: '1px solid #ddd', cursor: 'pointer', fontWeight: 500, fontSize: 15 }}>Cancel</button>
          </a>
        </div>
      </form>
    </div>
  )
}