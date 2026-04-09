'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'

export default function EditWorkOrderPage() {
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
    title: '',
    description: '',
    priority: 'medium',
    category: '',
    site_id: '',
    asset_id: '',
    assigned_to: '',
    due_at: '',
    sla_hours: '',
    completion_notes: '',
    actual_cost: '',
  })

  useEffect(() => { loadData() }, [id])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
    if (!profile) return
    const orgId = profile.organisation_id

    const [{ data: wo }, { data: assetData }, { data: siteData }, { data: techData }] = await Promise.all([
      supabase.from('work_orders').select('*').eq('id', id).single(),
      supabase.from('assets').select('id, name').eq('organisation_id', orgId).eq('status', 'active'),
      supabase.from('sites').select('id, name').eq('organisation_id', orgId).eq('is_active', true),
      supabase.from('users').select('id, full_name').eq('organisation_id', orgId).in('role', ['technician', 'manager']),
    ])

    if (assetData) setAssets(assetData)
    if (siteData) setSites(siteData)
    if (techData) setTechnicians(techData)

    if (wo) {
      setForm({
        title: wo.title ?? '',
        description: wo.description ?? '',
        priority: wo.priority ?? 'medium',
        category: wo.category ?? '',
        site_id: wo.site_id ?? '',
        asset_id: wo.asset_id ?? '',
        assigned_to: wo.assigned_to ?? '',
        due_at: wo.due_at ? wo.due_at.slice(0, 16) : '',
        sla_hours: wo.sla_hours ? String(wo.sla_hours) : '',
        completion_notes: wo.completion_notes ?? '',
        actual_cost: wo.actual_cost ? String(wo.actual_cost) : '',
      })
    }
    setLoading(false)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const { error: updateError } = await supabase.from('work_orders').update({
      title: form.title,
      description: form.description || null,
      priority: form.priority,
      category: form.category || null,
      site_id: form.site_id || null,
      asset_id: form.asset_id || null,
      assigned_to: form.assigned_to || null,
      due_at: form.due_at || null,
      sla_hours: form.sla_hours ? parseInt(form.sla_hours) : null,
      completion_notes: form.completion_notes || null,
      actual_cost: form.actual_cost ? parseFloat(form.actual_cost) : null,
      updated_at: new Date().toISOString(),
      status: form.assigned_to ? 'assigned' : 'new',
    }).eq('id', id)

    if (updateError) { setError(updateError.message); setSaving(false) }
    else router.push('/dashboard/work-orders/' + id)
  }

  const fieldStyle = { width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' as const, background: 'white' }
  const labelStyle = { display: 'block' as const, marginBottom: 6, fontSize: 13, fontWeight: 500 as const, color: '#444' }

  if (loading) return <div style={{ padding: '2rem' }}>Loading...</div>

  return (
    <div style={{ padding: '2rem', maxWidth: 680, margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <a href={'/dashboard/work-orders/' + id} style={{ color: '#999', fontSize: 13, textDecoration: 'none' }}>Back to Work Order</a>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0.5rem 0 0' }}>Edit Work Order</h1>
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
            <label style={labelStyle}>Priority *</label>
            <select name='priority' value={form.priority} onChange={handleChange} style={fieldStyle}>
              <option value='low'>Low</option>
              <option value='medium'>Medium</option>
              <option value='high'>High</option>
              <option value='critical'>Critical</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Category</label>
            <select name='category' value={form.category} onChange={handleChange} style={fieldStyle}>
              <option value=''>Select category</option>
              <option value='HVAC'>HVAC</option>
              <option value='Electrical'>Electrical</option>
              <option value='Plumbing'>Plumbing</option>
              <option value='Elevator / Lift'>Elevator / Lift</option>
              <option value='Fire Safety'>Fire Safety</option>
              <option value='Furniture'>Furniture</option>
              <option value='Kitchen Equipment'>Kitchen Equipment</option>
              <option value='Pool / Gym'>Pool / Gym</option>
              <option value='IT Equipment'>IT Equipment</option>
              <option value='Signage'>Signage</option>
              <option value='Vehicle'>Vehicle</option>
              <option value='Other'>Other</option>
            </select>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>Site</label>
            <select name='site_id' value={form.site_id} onChange={handleChange} style={fieldStyle}>
              <option value=''>Select site</option>
              {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Asset</label>
            <select name='asset_id' value={form.asset_id} onChange={handleChange} style={fieldStyle}>
              <option value=''>Select asset</option>
              {assets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
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
            <label style={labelStyle}>SLA (hours)</label>
            <input name='sla_hours' type='number' value={form.sla_hours} onChange={handleChange} placeholder='e.g. 24' style={fieldStyle} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>Due Date</label>
            <input name='due_at' type='datetime-local' value={form.due_at} onChange={handleChange} style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>Actual Cost (SAR)</label>
            <input name='actual_cost' type='number' value={form.actual_cost} onChange={handleChange} placeholder='e.g. 500' style={fieldStyle} />
          </div>
        </div>
        <div>
          <label style={labelStyle}>Completion Notes</label>
          <textarea name='completion_notes' value={form.completion_notes} onChange={handleChange} rows={3} placeholder='Notes on how the issue was resolved...' style={{ ...fieldStyle, resize: 'vertical' }} />
        </div>
        {error && <p style={{ color: 'red', fontSize: 13, margin: 0 }}>{error}</p>}
        <div style={{ display: 'flex', gap: 10 }}>
          <button type='submit' disabled={saving} style={{ flex: 1, background: '#1a1a2e', color: 'white', padding: '11px', borderRadius: 8, border: 'none', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 500, fontSize: 15, opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          <a href={'/dashboard/work-orders/' + id} style={{ flex: 1 }}>
            <button type='button' style={{ width: '100%', background: 'white', color: '#333', padding: '11px', borderRadius: 8, border: '1px solid #ddd', cursor: 'pointer', fontWeight: 500, fontSize: 15 }}>
              Cancel
            </button>
          </a>
        </div>
      </form>
    </div>
  )
}