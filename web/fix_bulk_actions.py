import os

# ── 1. Vendors list - add delete and bulk select ──
vendors_list = """'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'

export default function VendorsPage() {
  const [vendors, setVendors] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [deleting, setDeleting] = useState(false)
  const supabase = createClient()

  useEffect(() => { fetchVendors() }, [])

  async function fetchVendors() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
    if (!profile) return
    const { data } = await supabase.from('vendors').select('*').eq('organisation_id', profile.organisation_id).order('company_name', { ascending: true })
    if (data) setVendors(data)
    setLoading(false)
  }

  async function deleteSelected() {
    if (!confirm('Delete ' + selected.length + ' vendor(s)? This cannot be undone.')) return
    setDeleting(true)
    await supabase.from('vendors').delete().in('id', selected)
    setSelected([])
    await fetchVendors()
    setDeleting(false)
  }

  async function deleteOne(id: string) {
    if (!confirm('Delete this vendor?')) return
    await supabase.from('vendors').delete().eq('id', id)
    fetchVendors()
  }

  async function toggleActive(id: string, current: boolean) {
    await supabase.from('vendors').update({ is_active: !current }).eq('id', id)
    fetchVendors()
  }

  function toggleSelect(id: string) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function toggleSelectAll() {
    setSelected(prev => prev.length === filtered.length ? [] : filtered.map(v => v.id))
  }

  const filtered = vendors.filter(v =>
    v.company_name?.toLowerCase().includes(search.toLowerCase()) ||
    v.contact_name?.toLowerCase().includes(search.toLowerCase()) ||
    v.specialisation?.toLowerCase().includes(search.toLowerCase())
  )

  const stars = (rating: number) => {
    if (!rating) return '—'
    return Array.from({ length: 5 }, (_, i) => i < Math.round(rating) ? '★' : '☆').join('')
  }

  return (
    <div style={{ padding: '2rem', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>Vendors</h1>
          <p style={{ fontSize: 13, color: '#999', margin: '4px 0 0' }}>{vendors.length} vendors registered</p>
        </div>
        <Link href='/dashboard/vendors/new'>
          <button style={{ background: '#1a1a2e', color: 'white', padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 500 }}>+ Add Vendor</button>
        </Link>
      </div>

      <input value={search} onChange={e => setSearch(e.target.value)} placeholder='Search by company name, contact, or specialisation...' style={{ width: '100%', padding: '9px 14px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, marginBottom: '1rem', boxSizing: 'border-box' }} />

      {selected.length > 0 && (
        <div style={{ background: '#fce4ec', border: '1px solid #ef9a9a', borderRadius: 10, padding: '10px 16px', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: '#b71c1c' }}>{selected.length} vendor(s) selected</span>
          <button onClick={deleteSelected} disabled={deleting} style={{ padding: '6px 16px', borderRadius: 7, border: 'none', background: '#c62828', color: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>
            {deleting ? 'Deleting...' : 'Delete Selected'}
          </button>
          <button onClick={() => setSelected([])} style={{ padding: '6px 12px', borderRadius: 7, border: '1px solid #ef9a9a', background: 'white', cursor: 'pointer', fontSize: 12, color: '#666' }}>Cancel</button>
        </div>
      )}

      {loading ? <p style={{ color: '#999' }}>Loading...</p> : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: '#999' }}>
          <p style={{ fontSize: 18, marginBottom: 8 }}>No vendors yet</p>
          <p style={{ fontSize: 14 }}>Add your first vendor to assign them to work orders</p>
        </div>
      ) : (
        <div style={{ border: '1px solid #eee', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f9f9f9', borderBottom: '1px solid #eee' }}>
                <th style={{ padding: '12px 16px', width: 40 }}>
                  <input type='checkbox' checked={selected.length === filtered.length && filtered.length > 0} onChange={toggleSelectAll} />
                </th>
                {['Company','Contact','Phone','Specialisation','Rating','Status','Actions'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 500, color: '#666' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((v, i) => (
                <tr key={v.id} style={{ borderBottom: '1px solid #f0f0f0', background: selected.includes(v.id) ? '#fff3f3' : i % 2 === 0 ? 'white' : '#fafafa' }}>
                  <td style={{ padding: '12px 16px' }}>
                    <input type='checkbox' checked={selected.includes(v.id)} onChange={() => toggleSelect(v.id)} />
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <Link href={'/dashboard/vendors/' + v.id} style={{ color: '#1a1a2e', fontWeight: 500, textDecoration: 'none', fontSize: 14 }}>{v.company_name}</Link>
                    {v.company_name_ar && <p style={{ fontSize: 11, color: '#999', margin: '2px 0 0', direction: 'rtl' }}>{v.company_name_ar}</p>}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: '#666' }}>{v.contact_name ?? '—'}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: '#666' }}>{v.phone ?? '—'}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: '#666' }}>{v.specialisation ?? '—'}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: '#f57f17' }}>{stars(v.average_rating)}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ background: v.is_active ? '#e8f5e9' : '#f5f5f5', color: v.is_active ? '#2e7d32' : '#666', padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 500 }}>
                      {v.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Link href={'/dashboard/vendors/' + v.id}>
                        <button style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #ddd', background: 'white', cursor: 'pointer', fontSize: 11 }}>View</button>
                      </Link>
                      <Link href={'/dashboard/vendors/' + v.id + '/edit'}>
                        <button style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #ddd', background: 'white', cursor: 'pointer', fontSize: 11 }}>Edit</button>
                      </Link>
                      <button onClick={() => toggleActive(v.id, v.is_active)} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #ddd', background: 'white', cursor: 'pointer', fontSize: 11, color: '#666' }}>
                        {v.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button onClick={() => deleteOne(v.id)} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #ef9a9a', background: '#fce4ec', color: '#c62828', cursor: 'pointer', fontSize: 11 }}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}"""

with open('src/app/dashboard/vendors/page.tsx', 'w', encoding='utf-8') as f:
    f.write(vendors_list)
print('vendors/page.tsx updated')

# ── Vendor edit page ──
os.makedirs('src/app/dashboard/vendors/[id]/edit', exist_ok=True)

vendor_edit = """'use client'

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
}"""

with open('src/app/dashboard/vendors/[id]/edit/page.tsx', 'w', encoding='utf-8') as f:
    f.write(vendor_edit)
print('vendor edit page written')

# ── 2. PM Schedules - add edit page and delete ──
os.makedirs('src/app/dashboard/pm-schedules/[id]/edit', exist_ok=True)

pm_edit = """'use client'

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
}"""

with open('src/app/dashboard/pm-schedules/[id]/edit/page.tsx', 'w', encoding='utf-8') as f:
    f.write(pm_edit)
print('pm-schedules/[id]/edit/page.tsx written')

# ── Update PM list to add edit/delete/bulk ──
with open('src/app/dashboard/pm-schedules/page.tsx', 'r', encoding='utf-8') as f:
    pm_list = f.read()

# Add selected state and bulk delete
pm_list = pm_list.replace(
    "  const [generating, setGenerating] = useState<string | null>(null)",
    "  const [generating, setGenerating] = useState<string | null>(null)\n  const [selected, setSelected] = useState<string[]>([])\n  const [deleting, setDeleting] = useState(false)"
)

pm_list = pm_list.replace(
    "  async function toggleActive(id: string, current: boolean) {",
    """  async function deleteSelected() {
    if (!confirm('Delete ' + selected.length + ' schedule(s)?')) return
    setDeleting(true)
    await supabase.from('pm_schedules').delete().in('id', selected)
    setSelected([])
    await fetchSchedules()
    setDeleting(false)
  }

  async function deleteOne(id: string) {
    if (!confirm('Delete this PM schedule?')) return
    await supabase.from('pm_schedules').delete().eq('id', id)
    fetchSchedules()
  }

  function toggleSelect(id: string) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function toggleSelectAll() {
    setSelected(prev => prev.length === schedules.length ? [] : schedules.map(s => s.id))
  }

  async function toggleActive(id: string, current: boolean) {"""
)

# Add checkbox column to table header
pm_list = pm_list.replace(
    "              {['Schedule','Asset','Frequency','Assigned To','Next Due','Compliance','Status','Actions'].map(h => (",
    """              <th style={{ padding: '12px 16px', width: 40 }}>
                <input type='checkbox' checked={selected.length === schedules.length && schedules.length > 0} onChange={toggleSelectAll} />
              </th>
              {['Schedule','Asset','Frequency','Assigned To','Next Due','Compliance','Status','Actions'].map(h => ("""
)

# Add checkbox to each row
pm_list = pm_list.replace(
    "                  <tr key={s.id} style={{ borderBottom: '1px solid #f0f0f0', background: due && s.is_active ? '#fff8f8' : i % 2 === 0 ? 'white' : '#fafafa' }}>",
    """                  <tr key={s.id} style={{ borderBottom: '1px solid #f0f0f0', background: selected.includes(s.id) ? '#f3f4fd' : due && s.is_active ? '#fff8f8' : i % 2 === 0 ? 'white' : '#fafafa' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <input type='checkbox' checked={selected.includes(s.id)} onChange={() => toggleSelect(s.id)} />
                    </td>"""
)

# Add edit/delete to actions
pm_list = pm_list.replace(
    """                        <button onClick={() => toggleActive(s.id, s.is_active)} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid #ddd', background: 'white', color: '#666', cursor: 'pointer', fontSize: 12 }}>
                          {s.is_active ? 'Pause' : 'Resume'}
                        </button>""",
    """                        <a href={'/dashboard/pm-schedules/' + s.id + '/edit'}>
                          <button style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #ddd', background: 'white', cursor: 'pointer', fontSize: 12 }}>Edit</button>
                        </a>
                        <button onClick={() => toggleActive(s.id, s.is_active)} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid #ddd', background: 'white', color: '#666', cursor: 'pointer', fontSize: 12 }}>
                          {s.is_active ? 'Pause' : 'Resume'}
                        </button>
                        <button onClick={() => deleteOne(s.id)} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #ef9a9a', background: '#fce4ec', color: '#c62828', cursor: 'pointer', fontSize: 12 }}>Delete</button>"""
)

# Add bulk delete bar before table
pm_list = pm_list.replace(
    "      {loading ? (",
    """      {selected.length > 0 && (
        <div style={{ background: '#fce4ec', border: '1px solid #ef9a9a', borderRadius: 10, padding: '10px 16px', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: '#b71c1c' }}>{selected.length} schedule(s) selected</span>
          <button onClick={deleteSelected} disabled={deleting} style={{ padding: '6px 16px', borderRadius: 7, border: 'none', background: '#c62828', color: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>
            {deleting ? 'Deleting...' : 'Delete Selected'}
          </button>
          <button onClick={() => setSelected([])} style={{ padding: '6px 12px', borderRadius: 7, border: '1px solid #ef9a9a', background: 'white', cursor: 'pointer', fontSize: 12, color: '#666' }}>Cancel</button>
        </div>
      )}

      {loading ? ("""
)

with open('src/app/dashboard/pm-schedules/page.tsx', 'w', encoding='utf-8') as f:
    f.write(pm_list)
print('pm-schedules/page.tsx updated with edit/delete/bulk')

# ── 3. Assets list - add delete and bulk select ──
with open('src/app/dashboard/assets/page.tsx', 'r', encoding='utf-8') as f:
    assets_list = f.read()

assets_list = assets_list.replace(
    "  const [statusFilter, setStatusFilter] = useState('all')",
    "  const [statusFilter, setStatusFilter] = useState('all')\n  const [selected, setSelected] = useState<string[]>([])\n  const [deleting, setDeleting] = useState(false)"
)

assets_list = assets_list.replace(
    "  useEffect(() => { fetchAssets() }, [categoryFilter, statusFilter])",
    """  useEffect(() => { fetchAssets() }, [categoryFilter, statusFilter])

  async function deleteSelected() {
    if (!confirm('Delete ' + selected.length + ' asset(s)? This cannot be undone.')) return
    setDeleting(true)
    await supabase.from('assets').delete().in('id', selected)
    setSelected([])
    await fetchAssets()
    setDeleting(false)
  }

  async function deleteOne(id: string) {
    if (!confirm('Delete this asset?')) return
    await supabase.from('assets').delete().eq('id', id)
    fetchAssets()
  }

  function toggleSelect(id: string) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function toggleSelectAll() {
    setSelected(prev => prev.length === filtered.length ? [] : filtered.map(a => a.id))
  }"""
)

# Add checkbox to table header
assets_list = assets_list.replace(
    "              {['Asset Name','Category','Site','Serial Number','Status','Warranty Expiry','Added'].map(h => (",
    """              <th style={{ padding: '12px 16px', width: 40 }}>
                <input type='checkbox' checked={selected.length === filtered.length && filtered.length > 0} onChange={toggleSelectAll} />
              </th>
              {['Asset Name','Category','Site','Serial Number','Status','Warranty Expiry','Added','Actions'].map(h => ("""
)

# Add checkbox and delete to each row
assets_list = assets_list.replace(
    "                  <tr key={asset.id} style={{ borderBottom: '1px solid #f0f0f0', background: i % 2 === 0 ? 'white' : '#fafafa' }}>",
    """                  <tr key={asset.id} style={{ borderBottom: '1px solid #f0f0f0', background: selected.includes(asset.id) ? '#f3f4fd' : i % 2 === 0 ? 'white' : '#fafafa' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <input type='checkbox' checked={selected.includes(asset.id)} onChange={() => toggleSelect(asset.id)} />
                    </td>"""
)

# Add actions column to each row before closing tr
assets_list = assets_list.replace(
    "                    <td style={{ padding: '12px 16px', fontSize: 13, color: '#666' }}>{format(new Date(asset.created_at), 'dd MMM yyyy')}</td>\n                  </tr>",
    """                    <td style={{ padding: '12px 16px', fontSize: 13, color: '#666' }}>{format(new Date(asset.created_at), 'dd MMM yyyy')}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <a href={'/dashboard/assets/' + asset.id + '/edit'}>
                          <button style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #ddd', background: 'white', cursor: 'pointer', fontSize: 11 }}>Edit</button>
                        </a>
                        <button onClick={() => deleteOne(asset.id)} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #ef9a9a', background: '#fce4ec', color: '#c62828', cursor: 'pointer', fontSize: 11 }}>Delete</button>
                      </div>
                    </td>
                  </tr>"""
)

# Add bulk delete bar
assets_list = assets_list.replace(
    "      {loading ? (",
    """      {selected.length > 0 && (
        <div style={{ background: '#fce4ec', border: '1px solid #ef9a9a', borderRadius: 10, padding: '10px 16px', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: '#b71c1c' }}>{selected.length} asset(s) selected</span>
          <button onClick={deleteSelected} disabled={deleting} style={{ padding: '6px 16px', borderRadius: 7, border: 'none', background: '#c62828', color: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>
            {deleting ? 'Deleting...' : 'Delete Selected'}
          </button>
          <button onClick={() => setSelected([])} style={{ padding: '6px 12px', borderRadius: 7, border: '1px solid #ef9a9a', background: 'white', cursor: 'pointer', fontSize: 12, color: '#666' }}>Cancel</button>
        </div>
      )}

      {loading ? ("""
)

with open('src/app/dashboard/assets/page.tsx', 'w', encoding='utf-8') as f:
    f.write(assets_list)
print('assets/page.tsx updated with edit/delete/bulk')

print('All bulk action updates complete')