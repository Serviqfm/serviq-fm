import os

# ── 1. Updated PM Schedules list with fortnightly + seasonal flag ──
pm_list = """'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { format, isPast } from 'date-fns'
import Link from 'next/link'

export default function PMSchedulesPage() {
  const [schedules, setSchedules] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => { fetchSchedules() }, [])

  async function fetchSchedules() {
    setLoading(true)
    const { data, error } = await supabase
      .from('pm_schedules')
      .select('*, asset:asset_id(name), site:site_id(name), assignee:assigned_to(full_name)')
      .order('next_due_at', { ascending: true })
    if (!error && data) setSchedules(data)
    setLoading(false)
  }

  function calculateNextDue(frequency: string): string {
    const now = new Date()
    switch (frequency) {
      case 'daily':       now.setDate(now.getDate() + 1); break
      case 'weekly':      now.setDate(now.getDate() + 7); break
      case 'fortnightly': now.setDate(now.getDate() + 14); break
      case 'monthly':     now.setMonth(now.getMonth() + 1); break
      case 'quarterly':   now.setMonth(now.getMonth() + 3); break
      case 'biannual':    now.setMonth(now.getMonth() + 6); break
      case 'annual':      now.setFullYear(now.getFullYear() + 1); break
      default:            now.setMonth(now.getMonth() + 1)
    }
    return now.toISOString()
  }

  async function generateWorkOrder(schedule: any) {
    setGenerating(schedule.id)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setGenerating(null); return }
    const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
    if (!profile) { setGenerating(null); return }
    const { error } = await supabase.from('work_orders').insert({
      title: schedule.title,
      description: schedule.description || null,
      priority: 'medium',
      status: schedule.assigned_to ? 'assigned' : 'new',
      source: 'pm_schedule',
      asset_id: schedule.asset_id || null,
      site_id: schedule.site_id || null,
      assigned_to: schedule.assigned_to || null,
      organisation_id: profile.organisation_id,
      created_by: user.id,
    })
    if (!error) {
      await supabase.from('pm_schedules').update({
        last_completed_at: new Date().toISOString(),
        last_generated_at: new Date().toISOString(),
        next_due_at: calculateNextDue(schedule.frequency),
        completed_count: (schedule.completed_count || 0) + 1,
        on_time_count: (schedule.on_time_count || 0) + (isPast(new Date(schedule.next_due_at)) ? 0 : 1),
      }).eq('id', schedule.id)
      fetchSchedules()
    }
    setGenerating(null)
  }

  async function toggleActive(id: string, current: boolean) {
    await supabase.from('pm_schedules').update({ is_active: !current }).eq('id', id)
    fetchSchedules()
  }

  const freqLabel: Record<string, string> = {
    daily: 'Daily', weekly: 'Weekly', fortnightly: 'Fortnightly',
    monthly: 'Monthly', quarterly: 'Quarterly', biannual: 'Every 6 Months', annual: 'Annual',
  }

  const isDue = (s: any) => s.next_due_at && isPast(new Date(s.next_due_at))
  const isDueSoon = (s: any) => {
    if (!s.next_due_at) return false
    const days = Math.ceil((new Date(s.next_due_at).getTime() - Date.now()) / 86400000)
    return days >= 0 && days <= 7
  }

  const stats = {
    total: schedules.length,
    active: schedules.filter(s => s.is_active).length,
    due: schedules.filter(s => s.is_active && isDue(s)).length,
    soon: schedules.filter(s => s.is_active && isDueSoon(s) && !isDue(s)).length,
    seasonal: schedules.filter(s => s.is_seasonal).length,
  }

  return (
    <div style={{ padding: '2rem', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>Preventive Maintenance</h1>
          <p style={{ fontSize: 13, color: '#999', margin: '4px 0 0' }}>
            {stats.total} schedules · {stats.active} active
            {stats.due > 0 && <span style={{ color: '#c62828' }}> · {stats.due} overdue</span>}
            {stats.soon > 0 && <span style={{ color: '#f57f17' }}> · {stats.soon} due this week</span>}
            {stats.seasonal > 0 && <span style={{ color: '#1565c0' }}> · {stats.seasonal} seasonal</span>}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href='/dashboard/pm-schedules/calendar'>
            <button style={{ background: 'white', color: '#1a1a2e', padding: '8px 16px', borderRadius: 8, border: '1px solid #1a1a2e', cursor: 'pointer', fontWeight: 500, fontSize: 13 }}>
              Calendar View
            </button>
          </Link>
          <Link href='/dashboard/pm-schedules/compliance'>
            <button style={{ background: 'white', color: '#1a1a2e', padding: '8px 16px', borderRadius: 8, border: '1px solid #1a1a2e', cursor: 'pointer', fontWeight: 500, fontSize: 13 }}>
              Compliance
            </button>
          </Link>
          <Link href='/dashboard/pm-schedules/new'>
            <button style={{ background: '#1a1a2e', color: 'white', padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 500 }}>
              + New Schedule
            </button>
          </Link>
        </div>
      </div>

      {loading ? (
        <p style={{ color: '#999' }}>Loading...</p>
      ) : schedules.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: '#999' }}>
          <p style={{ fontSize: 18, marginBottom: 8 }}>No PM schedules yet</p>
          <p style={{ fontSize: 14 }}>Create your first preventive maintenance schedule</p>
        </div>
      ) : (
        <div style={{ border: '1px solid #eee', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f9f9f9', borderBottom: '1px solid #eee' }}>
                {['Schedule','Asset','Frequency','Assigned To','Next Due','Compliance','Status','Actions'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 500, color: '#666' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {schedules.map((s, i) => {
                const due = isDue(s)
                const soon = isDueSoon(s)
                const compliance = s.completed_count > 0 ? Math.round((s.on_time_count / s.completed_count) * 100) : null
                return (
                  <tr key={s.id} style={{ borderBottom: '1px solid #f0f0f0', background: due && s.is_active ? '#fff8f8' : i % 2 === 0 ? 'white' : '#fafafa' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <p style={{ fontSize: 14, fontWeight: 500, margin: 0 }}>{s.title}</p>
                        {s.is_seasonal && <span style={{ fontSize: 10, background: '#e3f2fd', color: '#1565c0', padding: '1px 6px', borderRadius: 4 }}>Seasonal</span>}
                      </div>
                      {s.description && <p style={{ fontSize: 12, color: '#999', margin: '2px 0 0' }}>{s.description.slice(0, 50)}{s.description.length > 50 ? '...' : ''}</p>}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: '#666' }}>{s.asset?.name ?? '—'}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ background: '#e8eaf6', color: '#283593', padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 500 }}>
                        {freqLabel[s.frequency] ?? s.frequency}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: '#666' }}>{s.assignee?.full_name ?? 'Unassigned'}</td>
                    <td style={{ padding: '12px 16px', fontSize: 13 }}>
                      {s.next_due_at ? (
                        <span style={{ color: due ? '#c62828' : soon ? '#f57f17' : '#666', fontWeight: due || soon ? 600 : 400 }}>
                          {format(new Date(s.next_due_at), 'dd MMM yyyy')}
                          {due && ' (Overdue)'}
                          {soon && !due && ' (Due soon)'}
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 13 }}>
                      {compliance !== null ? (
                        <span style={{ color: compliance >= 80 ? '#2e7d32' : compliance >= 50 ? '#f57f17' : '#c62828', fontWeight: 600 }}>
                          {compliance}%
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ background: s.is_active ? '#e8f5e9' : '#f5f5f5', color: s.is_active ? '#2e7d32' : '#666', padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 500 }}>
                        {s.is_active ? 'Active' : 'Paused'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {s.is_active && (
                          <button onClick={() => generateWorkOrder(s)} disabled={generating === s.id} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid #1a1a2e', background: 'white', color: '#1a1a2e', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>
                            {generating === s.id ? '...' : 'Generate WO'}
                          </button>
                        )}
                        <button onClick={() => toggleActive(s.id, s.is_active)} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid #ddd', background: 'white', color: '#666', cursor: 'pointer', fontSize: 12 }}>
                          {s.is_active ? 'Pause' : 'Resume'}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}"""

# ── 2. Updated PM New Schedule form with fortnightly + seasonal ──
pm_new = """'use client'

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
    is_seasonal: false,
    seasonal_start_month: '1',
    seasonal_end_month: '12',
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
      is_seasonal: form.is_seasonal,
      seasonal_start_month: form.is_seasonal ? parseInt(form.seasonal_start_month) : null,
      seasonal_end_month: form.is_seasonal ? parseInt(form.seasonal_end_month) : null,
      organisation_id: profile.organisation_id,
      is_active: true,
      completed_count: 0,
      on_time_count: 0,
    })
    if (insertError) { setError(insertError.message); setLoading(false) }
    else router.push('/dashboard/pm-schedules')
  }

  const fieldStyle = { width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' as const, background: 'white' }
  const labelStyle = { display: 'block' as const, marginBottom: 6, fontSize: 13, fontWeight: 500 as const, color: '#444' }

  const months = ['January','February','March','April','May','June','July','August','September','October','November','December']

  const templates = [
    { label: 'AC Filter Cleaning', description: 'Clean and replace AC filters, check refrigerant levels, inspect coils' },
    { label: 'Fire Safety Check', description: 'Inspect fire extinguishers, check expiry dates, test fire alarm panel' },
    { label: 'Elevator Service', description: 'Monthly elevator inspection, lubrication, safety test and logbook update' },
    { label: 'Pool Chemical Check', description: 'Test pH and chlorine levels, add chemicals as required, inspect pump and filter' },
    { label: 'Generator Test Run', description: 'Run generator for 30 minutes under load, check fuel level and battery' },
    { label: 'Refrigeration PM', description: 'Check temperature logs, clean condenser coils, inspect door seals' },
    { label: 'AC Pre-Summer Service', description: 'Full AC service before summer season: coil cleaning, gas top-up, thermostat check' },
    { label: 'Pest Control', description: 'Quarterly pest control treatment of all areas including kitchen, storage, and outdoor areas' },
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

        <div style={{ background: '#f9f9f9', border: '1px solid #eee', borderRadius: 8, padding: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: form.is_seasonal ? 12 : 0 }}>
            <input type='checkbox' id='is_seasonal' checked={form.is_seasonal} onChange={e => setForm(prev => ({ ...prev, is_seasonal: e.target.checked }))} style={{ width: 16, height: 16, cursor: 'pointer' }} />
            <label htmlFor='is_seasonal' style={{ fontSize: 13, fontWeight: 500, color: '#444', cursor: 'pointer' }}>
              Seasonal schedule (e.g. AC pre-summer, Ramadan adjustments)
            </label>
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
        <button type='submit' disabled={loading} style={{ background: '#1a1a2e', color: 'white', padding: '11px', borderRadius: 8, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 500, fontSize: 15, opacity: loading ? 0.7 : 1 }}>
          {loading ? 'Saving...' : 'Create PM Schedule'}
        </button>
      </form>
    </div>
  )
}"""

# ── 3. PM Compliance Dashboard ──
pm_compliance = """'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'

export default function PMCompliancePage() {
  const [schedules, setSchedules] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filterCategory, setFilterCategory] = useState('all')
  const [filterSite, setFilterSite] = useState('all')
  const [filterTech, setFilterTech] = useState('all')
  const [sites, setSites] = useState<any[]>([])
  const [technicians, setTechnicians] = useState<any[]>([])
  const supabase = createClient()

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
    if (!profile) return
    const orgId = profile.organisation_id

    const [{ data: sched }, { data: siteData }, { data: techData }] = await Promise.all([
      supabase.from('pm_schedules').select('*, asset:asset_id(name, category), site:site_id(name), assignee:assigned_to(full_name)').eq('organisation_id', orgId),
      supabase.from('sites').select('id, name').eq('organisation_id', orgId),
      supabase.from('users').select('id, full_name').eq('organisation_id', orgId).in('role', ['technician', 'manager']),
    ])
    if (sched) setSchedules(sched)
    if (siteData) setSites(siteData)
    if (techData) setTechnicians(techData)
    setLoading(false)
  }

  const filtered = schedules.filter(s => {
    const matchCategory = filterCategory === 'all' || s.asset?.category === filterCategory
    const matchSite = filterSite === 'all' || s.site_id === filterSite
    const matchTech = filterTech === 'all' || s.assigned_to === filterTech
    return matchCategory && matchSite && matchTech
  })

  const totalSchedules = filtered.length
  const activeSchedules = filtered.filter(s => s.is_active).length
  const totalCompleted = filtered.reduce((sum, s) => sum + (s.completed_count || 0), 0)
  const totalOnTime = filtered.reduce((sum, s) => sum + (s.on_time_count || 0), 0)
  const overallCompliance = totalCompleted > 0 ? Math.round((totalOnTime / totalCompleted) * 100) : 0

  const complianceColor = (pct: number) => pct >= 80 ? '#2e7d32' : pct >= 50 ? '#f57f17' : '#c62828'
  const complianceBg = (pct: number) => pct >= 80 ? '#e8f5e9' : pct >= 50 ? '#fff8e1' : '#fce4ec'

  const categories = [...new Set(schedules.map(s => s.asset?.category).filter(Boolean))]

  const selectStyle = { padding: '7px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 13, background: 'white', cursor: 'pointer' }

  if (loading) return <div style={{ padding: '2rem' }}>Loading...</div>

  return (
    <div style={{ padding: '2rem', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>PM Compliance Dashboard</h1>
          <p style={{ fontSize: 13, color: '#999', margin: '4px 0 0' }}>Track preventive maintenance completion rates</p>
        </div>
        <Link href='/dashboard/pm-schedules'>
          <button style={{ background: 'white', color: '#1a1a2e', padding: '8px 16px', borderRadius: 8, border: '1px solid #1a1a2e', cursor: 'pointer', fontSize: 13 }}>
            Back to Schedules
          </button>
        </Link>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: '1.5rem' }}>
        {[
          { label: 'Total Schedules', value: totalSchedules, color: '#1a1a2e' },
          { label: 'Active Schedules', value: activeSchedules, color: '#2e7d32' },
          { label: 'Total Completed', value: totalCompleted, color: '#283593' },
          { label: 'Overall Compliance', value: overallCompliance + '%', color: complianceColor(overallCompliance) },
        ].map(card => (
          <div key={card.label} style={{ background: 'white', border: '1px solid #eee', borderRadius: 12, padding: '1rem' }}>
            <p style={{ fontSize: 12, color: '#999', margin: '0 0 8px', fontWeight: 500 }}>{card.label}</p>
            <p style={{ fontSize: 28, fontWeight: 700, margin: 0, color: card.color }}>{card.value}</p>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} style={selectStyle}>
          <option value='all'>All Categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filterSite} onChange={e => setFilterSite(e.target.value)} style={selectStyle}>
          <option value='all'>All Sites</option>
          {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={filterTech} onChange={e => setFilterTech(e.target.value)} style={selectStyle}>
          <option value='all'>All Technicians</option>
          {technicians.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
        </select>
        {(filterCategory !== 'all' || filterSite !== 'all' || filterTech !== 'all') && (
          <button onClick={() => { setFilterCategory('all'); setFilterSite('all'); setFilterTech('all') }} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #ddd', background: 'white', cursor: 'pointer', fontSize: 13, color: '#c62828' }}>
            Clear
          </button>
        )}
      </div>

      <div style={{ border: '1px solid #eee', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f9f9f9', borderBottom: '1px solid #eee' }}>
              {['Schedule','Asset','Site','Assigned To','Completed','On Time','Compliance'].map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 500, color: '#666' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: '#999' }}>No schedules match your filters</td></tr>
            ) : filtered.map((s, i) => {
              const compliance = s.completed_count > 0 ? Math.round((s.on_time_count / s.completed_count) * 100) : null
              return (
                <tr key={s.id} style={{ borderBottom: '1px solid #f0f0f0', background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                  <td style={{ padding: '12px 16px' }}>
                    <p style={{ fontSize: 14, fontWeight: 500, margin: 0 }}>{s.title}</p>
                    <p style={{ fontSize: 12, color: '#999', margin: '2px 0 0' }}>{s.frequency}</p>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: '#666' }}>
                    {s.asset?.name ?? '—'}
                    {s.asset?.category && <p style={{ fontSize: 11, color: '#bbb', margin: '2px 0 0' }}>{s.asset.category}</p>}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: '#666' }}>{s.site?.name ?? '—'}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: '#666' }}>{s.assignee?.full_name ?? 'Unassigned'}</td>
                  <td style={{ padding: '12px 16px', fontSize: 14, fontWeight: 600, color: '#1a1a2e' }}>{s.completed_count || 0}</td>
                  <td style={{ padding: '12px 16px', fontSize: 14, fontWeight: 600, color: '#2e7d32' }}>{s.on_time_count || 0}</td>
                  <td style={{ padding: '12px 16px' }}>
                    {compliance !== null ? (
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, background: '#f0f0f0', borderRadius: 4, height: 8 }}>
                            <div style={{ background: complianceColor(compliance), borderRadius: 4, height: 8, width: compliance + '%' }} />
                          </div>
                          <span style={{ fontSize: 13, fontWeight: 600, color: complianceColor(compliance), minWidth: 36 }}>{compliance}%</span>
                        </div>
                      </div>
                    ) : <span style={{ fontSize: 13, color: '#bbb' }}>No data</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}"""

# ── 4. PM Calendar View ──
pm_calendar = """'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, isToday, addMonths, subMonths } from 'date-fns'
import Link from 'next/link'

export default function PMCalendarPage() {
  const [schedules, setSchedules] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const supabase = createClient()

  useEffect(() => { fetchSchedules() }, [])

  async function fetchSchedules() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
    if (!profile) return
    const { data } = await supabase.from('pm_schedules').select('*, asset:asset_id(name), assignee:assigned_to(full_name)').eq('organisation_id', profile.organisation_id).eq('is_active', true).not('next_due_at', 'is', null)
    if (data) setSchedules(data)
    setLoading(false)
  }

  const days = eachDayOfInterval({ start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) })
  const startPad = startOfMonth(currentMonth).getDay()

  const getSchedulesForDay = (day: Date) => schedules.filter(s => s.next_due_at && isSameDay(new Date(s.next_due_at), day))

  const upcomingThisMonth = schedules.filter(s => {
    if (!s.next_due_at) return false
    const d = new Date(s.next_due_at)
    return isSameMonth(d, currentMonth)
  }).sort((a, b) => new Date(a.next_due_at).getTime() - new Date(b.next_due_at).getTime())

  if (loading) return <div style={{ padding: '2rem' }}>Loading...</div>

  return (
    <div style={{ padding: '2rem', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>PM Calendar</h1>
          <p style={{ fontSize: 13, color: '#999', margin: '4px 0 0' }}>{upcomingThisMonth.length} tasks scheduled this month</p>
        </div>
        <Link href='/dashboard/pm-schedules'>
          <button style={{ background: 'white', color: '#1a1a2e', padding: '8px 16px', borderRadius: 8, border: '1px solid #1a1a2e', cursor: 'pointer', fontSize: 13 }}>
            Back to Schedules
          </button>
        </Link>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: '1.5rem' }}>
        <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #ddd', background: 'white', cursor: 'pointer', fontSize: 14 }}>←</button>
        <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0, minWidth: 200, textAlign: 'center' }}>{format(currentMonth, 'MMMM yyyy')}</h2>
        <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #ddd', background: 'white', cursor: 'pointer', fontSize: 14 }}>→</button>
        <button onClick={() => setCurrentMonth(new Date())} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #ddd', background: 'white', cursor: 'pointer', fontSize: 13, color: '#666' }}>Today</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, background: '#eee', border: '1px solid #eee', borderRadius: 12, overflow: 'hidden', marginBottom: '2rem' }}>
        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
          <div key={d} style={{ background: '#f9f9f9', padding: '8px', textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#666' }}>{d}</div>
        ))}
        {Array.from({ length: startPad }).map((_, i) => (
          <div key={'pad-' + i} style={{ background: 'white', minHeight: 80 }} />
        ))}
        {days.map(day => {
          const daySchedules = getSchedulesForDay(day)
          const today = isToday(day)
          return (
            <div key={day.toISOString()} style={{ background: 'white', minHeight: 80, padding: 6, position: 'relative' }}>
              <div style={{ fontSize: 13, fontWeight: today ? 700 : 400, color: today ? 'white', width: 24, height: 24, borderRadius: '50%', background: today ? '#1a1a2e' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
                {format(day, 'd')}
              </div>
              {daySchedules.slice(0, 2).map(s => (
                <div key={s.id} style={{ fontSize: 10, background: '#e8eaf6', color: '#283593', borderRadius: 4, padding: '2px 4px', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {s.title}
                </div>
              ))}
              {daySchedules.length > 2 && (
                <div style={{ fontSize: 10, color: '#999' }}>+{daySchedules.length - 2} more</div>
              )}
            </div>
          )
        })}
      </div>

      <div>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: '1rem' }}>All tasks this month</h3>
        {upcomingThisMonth.length === 0 ? (
          <p style={{ fontSize: 13, color: '#999' }}>No PM tasks scheduled for this month.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {upcomingThisMonth.map(s => (
              <div key={s.id} style={{ background: 'white', border: '1px solid #eee', borderRadius: 10, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 500, margin: 0 }}>{s.title}</p>
                  <p style={{ fontSize: 12, color: '#999', margin: '3px 0 0' }}>{s.asset?.name ?? 'No asset'} · {s.assignee?.full_name ?? 'Unassigned'}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: 13, fontWeight: 600, margin: 0, color: '#283593' }}>{format(new Date(s.next_due_at), 'dd MMM yyyy')}</p>
                  <span style={{ fontSize: 11, background: '#e8eaf6', color: '#283593', padding: '1px 8px', borderRadius: 10 }}>{s.frequency}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}"""

with open('src/app/dashboard/pm-schedules/page.tsx', 'w', encoding='utf-8') as f:
    f.write(pm_list)
print('pm-schedules/page.tsx written')

with open('src/app/dashboard/pm-schedules/new/page.tsx', 'w', encoding='utf-8') as f:
    f.write(pm_new)
print('pm-schedules/new/page.tsx written')

os.makedirs('src/app/dashboard/pm-schedules/compliance', exist_ok=True)
with open('src/app/dashboard/pm-schedules/compliance/page.tsx', 'w', encoding='utf-8') as f:
    f.write(pm_compliance)
print('pm-schedules/compliance/page.tsx written')

os.makedirs('src/app/dashboard/pm-schedules/calendar', exist_ok=True)
with open('src/app/dashboard/pm-schedules/calendar/page.tsx', 'w', encoding='utf-8') as f:
    f.write(pm_calendar)
print('pm-schedules/calendar/page.tsx written')
