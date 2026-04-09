new_asset = """'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function NewAssetPage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sites, setSites] = useState<any[]>([])
  const [photos, setPhotos] = useState<File[]>([])
  const [photoPreviewUrls, setPhotoPreviewUrls] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState({
    name: '',
    category: '',
    site_id: '',
    sub_location: '',
    serial_number: '',
    manufacturer: '',
    model: '',
    purchase_date: '',
    purchase_cost: '',
    warranty_expiry: '',
    expected_lifespan_years: '',
    description: '',
    location_notes: '',
  })

  useEffect(() => { loadSites() }, [])

  async function loadSites() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
    if (!profile) return
    const { data } = await supabase.from('sites').select('id, name').eq('organisation_id', profile.organisation_id).eq('is_active', true)
    if (data) setSites(data)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    const toAdd = files.slice(0, 10 - photos.length)
    setPhotos(prev => [...prev, ...toAdd])
    setPhotoPreviewUrls(prev => [...prev, ...toAdd.map(f => URL.createObjectURL(f))])
  }

  function removePhoto(index: number) {
    setPhotos(prev => prev.filter((_, i) => i !== index))
    setPhotoPreviewUrls(prev => prev.filter((_, i) => i !== index))
  }

  async function uploadPhotos(orgId: string): Promise<string[]> {
    const urls: string[] = []
    for (const file of photos) {
      const fileName = orgId + '/' + Date.now() + '-asset-' + file.name
      const { data, error } = await supabase.storage.from('work-order-media').upload(fileName, file)
      if (!error && data) {
        const { data: urlData } = supabase.storage.from('work-order-media').getPublicUrl(data.path)
        urls.push(urlData.publicUrl)
      }
    }
    return urls
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Not logged in'); setLoading(false); return }
    const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
    if (!profile) { setError('User profile not found'); setLoading(false); return }
    let photoUrls: string[] = []
    if (photos.length > 0) photoUrls = await uploadPhotos(profile.organisation_id)
    const qrCode = 'SERVIQ-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9).toUpperCase()
    const { error: insertError } = await supabase.from('assets').insert({
      name: form.name,
      category: form.category || null,
      site_id: form.site_id || null,
      sub_location: form.sub_location || null,
      serial_number: form.serial_number || null,
      manufacturer: form.manufacturer || null,
      model: form.model || null,
      purchase_date: form.purchase_date || null,
      purchase_cost: form.purchase_cost ? parseFloat(form.purchase_cost) : null,
      warranty_expiry: form.warranty_expiry || null,
      expected_lifespan_years: form.expected_lifespan_years ? parseInt(form.expected_lifespan_years) : null,
      description: form.description || null,
      location_notes: form.location_notes || null,
      photo_urls: photoUrls,
      organisation_id: profile.organisation_id,
      status: 'active',
      qr_code: qrCode,
    })
    if (insertError) { setError(insertError.message); setLoading(false) }
    else router.push('/dashboard/assets')
  }

  const fieldStyle = { width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' as const, background: 'white' }
  const labelStyle = { display: 'block' as const, marginBottom: 6, fontSize: 13, fontWeight: 500 as const, color: '#444' }

  return (
    <div style={{ padding: '2rem', maxWidth: 680, margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <a href='/dashboard/assets' style={{ color: '#999', fontSize: 13, textDecoration: 'none' }}>Back to Assets</a>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0.5rem 0 0' }}>Add New Asset</h1>
      </div>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div>
          <label style={labelStyle}>Asset Name *</label>
          <input name='name' value={form.name} onChange={handleChange} required placeholder='e.g. Carrier AC Unit - Room 204' style={fieldStyle} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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
            <label style={labelStyle}>Sub-location</label>
            <input name='sub_location' value={form.sub_location} onChange={handleChange} placeholder='e.g. Floor 2, Room 204' style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>Location Notes</label>
            <input name='location_notes' value={form.location_notes} onChange={handleChange} placeholder='e.g. Near east stairwell' style={fieldStyle} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>Manufacturer</label>
            <input name='manufacturer' value={form.manufacturer} onChange={handleChange} placeholder='e.g. Carrier' style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>Model</label>
            <input name='model' value={form.model} onChange={handleChange} placeholder='e.g. 42QHC018DS' style={fieldStyle} />
          </div>
        </div>
        <div>
          <label style={labelStyle}>Serial Number</label>
          <input name='serial_number' value={form.serial_number} onChange={handleChange} placeholder='e.g. SN-2024-00123' style={fieldStyle} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>Purchase Date</label>
            <input name='purchase_date' type='date' value={form.purchase_date} onChange={handleChange} style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>Purchase Cost (SAR)</label>
            <input name='purchase_cost' type='number' value={form.purchase_cost} onChange={handleChange} placeholder='e.g. 12500' style={fieldStyle} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>Warranty Expiry</label>
            <input name='warranty_expiry' type='date' value={form.warranty_expiry} onChange={handleChange} style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>Expected Lifespan (years)</label>
            <input name='expected_lifespan_years' type='number' value={form.expected_lifespan_years} onChange={handleChange} placeholder='e.g. 10' style={fieldStyle} />
          </div>
        </div>
        <div>
          <label style={labelStyle}>Description</label>
          <textarea name='description' value={form.description} onChange={handleChange} rows={3} placeholder='Additional notes...' style={{ ...fieldStyle, resize: 'vertical' }} />
        </div>
        <div>
          <label style={labelStyle}>
            Photos (up to 10)
            <span style={{ fontWeight: 400, color: '#999', marginLeft: 8, fontSize: 12 }}>6-month media retention</span>
          </label>
          <div onClick={() => fileInputRef.current?.click()} style={{ border: '2px dashed #ddd', borderRadius: 8, padding: '1.5rem', textAlign: 'center', cursor: 'pointer', color: '#999', fontSize: 13 }}>
            {photos.length < 10 ? 'Click to add photos (' + photos.length + '/10)' : 'Maximum 10 photos reached'}
          </div>
          <input ref={fileInputRef} type='file' accept='image/*' multiple onChange={handlePhotoChange} style={{ display: 'none' }} />
          {photoPreviewUrls.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              {photoPreviewUrls.map((url, i) => (
                <div key={i} style={{ position: 'relative' }}>
                  <img src={url} alt='' style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: '1px solid #eee' }} />
                  <button type='button' onClick={() => removePhoto(i)} style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', background: '#c62828', color: 'white', border: 'none', cursor: 'pointer', fontSize: 12 }}>x</button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ background: '#f0f7ff', border: '1px solid #b3d4f5', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#1565c0' }}>
          A unique QR code will be automatically generated for this asset when saved.
        </div>
        {error && <p style={{ color: 'red', fontSize: 13, margin: 0 }}>{error}</p>}
        <button type='submit' disabled={loading} style={{ background: '#1a1a2e', color: 'white', padding: '11px', borderRadius: 8, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 500, fontSize: 15, opacity: loading ? 0.7 : 1 }}>
          {loading ? 'Saving...' : 'Save Asset'}
        </button>
      </form>
    </div>
  )
}"""

asset_detail = """'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { format, differenceInDays } from 'date-fns'
import { useParams } from 'next/navigation'
import Link from 'next/link'

export default function AssetDetailPage() {
  const { id } = useParams()
  const supabase = createClient()
  const [asset, setAsset] = useState<any>(null)
  const [workOrders, setWorkOrders] = useState<any[]>([])
  const [pmSchedules, setPmSchedules] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'details' | 'workorders' | 'pm' | 'photos' | 'qr'>('details')

  useEffect(() => { fetchAll() }, [id])

  async function fetchAll() {
    const [{ data: assetData }, { data: woData }, { data: pmData }] = await Promise.all([
      supabase.from('assets').select('*, site:site_id(name)').eq('id', id).single(),
      supabase.from('work_orders').select('*, assignee:assigned_to(full_name)').eq('asset_id', id).order('created_at', { ascending: false }),
      supabase.from('pm_schedules').select('*, assignee:assigned_to(full_name)').eq('asset_id', id).order('created_at', { ascending: false }),
    ])
    if (assetData) setAsset(assetData)
    if (woData) setWorkOrders(woData)
    if (pmData) setPmSchedules(pmData)
    setLoading(false)
  }

  async function updateStatus(newStatus: string) {
    await supabase.from('assets').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', id)
    fetchAll()
  }

  if (loading) return <div style={{ padding: '2rem' }}>Loading...</div>
  if (!asset) return <div style={{ padding: '2rem' }}>Asset not found.</div>

  const warrantyDaysLeft = asset.warranty_expiry ? differenceInDays(new Date(asset.warranty_expiry), new Date()) : null
  const warrantyExpired = warrantyDaysLeft !== null && warrantyDaysLeft < 0
  const warrantySoon = warrantyDaysLeft !== null && warrantyDaysLeft >= 0 && warrantyDaysLeft <= 30

  const lifecycleCost = workOrders
    .filter(w => w.status === 'closed')
    .reduce((sum: number, w: any) => sum + (w.actual_cost || 0), 0)

  const statusConfig: Record<string, { bg: string; color: string; label: string }> = {
    active:            { bg: '#e8f5e9', color: '#2e7d32', label: 'Active' },
    under_maintenance: { bg: '#fff8e1', color: '#f57f17', label: 'Under Maintenance' },
    retired:           { bg: '#f5f5f5', color: '#424242', label: 'Retired' },
  }

  const woStatusConfig: Record<string, { bg: string; color: string }> = {
    new:         { bg: '#e3f2fd', color: '#0d47a1' },
    assigned:    { bg: '#e8eaf6', color: '#283593' },
    in_progress: { bg: '#fff8e1', color: '#f57f17' },
    on_hold:     { bg: '#fce4ec', color: '#880e4f' },
    completed:   { bg: '#e8f5e9', color: '#1b5e20' },
    closed:      { bg: '#f5f5f5', color: '#424242' },
  }

  const sCfg = statusConfig[asset.status] ?? statusConfig.active
  const tabStyle = (active: boolean) => ({
    padding: '8px 16px', border: 'none',
    borderBottom: active ? '2px solid #1a1a2e' : '2px solid transparent',
    background: 'transparent', cursor: 'pointer',
    fontSize: 13, fontWeight: (active ? 600 : 400) as any,
    color: active ? '#1a1a2e' : '#999',
  })
  const cardStyle = { background: '#f9f9f9', borderRadius: 8, padding: '12px 16px' }
  const openWOs = workOrders.filter(w => !['completed','closed'].includes(w.status)).length
  const photos = asset.photo_urls ?? []

  return (
    <div style={{ padding: '2rem', maxWidth: 900, margin: '0 auto' }}>
      <a href='/dashboard/assets' style={{ color: '#999', fontSize: 13, textDecoration: 'none' }}>Back to Assets</a>

      <div style={{ marginTop: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>{asset.name}</h1>
          <span style={{ background: sCfg.bg, color: sCfg.color, padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 500 }}>{sCfg.label}</span>
          {asset.category && <span style={{ background: '#f0f0f0', color: '#555', padding: '2px 10px', borderRadius: 12, fontSize: 12 }}>{asset.category}</span>}
        </div>
        <p style={{ color: '#999', fontSize: 13, marginTop: 6 }}>
          Added {format(new Date(asset.created_at), 'dd MMM yyyy')} · {workOrders.length} work orders · {openWOs} open
          {asset.purchase_cost && <span> · Purchase cost: SAR {Number(asset.purchase_cost).toLocaleString()}</span>}
        </p>
      </div>

      {warrantyExpired && (
        <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: '1rem', background: '#fce4ec', border: '1px solid #ef9a9a', fontSize: 13, color: '#b71c1c' }}>
          Warranty expired {Math.abs(warrantyDaysLeft!)} days ago ({format(new Date(asset.warranty_expiry), 'dd MMM yyyy')})
        </div>
      )}
      {warrantySoon && !warrantyExpired && (
        <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: '1rem', background: '#fff8e1', border: '1px solid #ffe082', fontSize: 13, color: '#f57f17' }}>
          Warranty expires in {warrantyDaysLeft} days ({format(new Date(asset.warranty_expiry), 'dd MMM yyyy')})
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {asset.status !== 'active' && <button onClick={() => updateStatus('active')} style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid #a5d6a7', background: '#e8f5e9', color: '#2e7d32', cursor: 'pointer', fontSize: 13 }}>Mark Active</button>}
        {asset.status !== 'under_maintenance' && <button onClick={() => updateStatus('under_maintenance')} style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid #ffe082', background: '#fff8e1', color: '#f57f17', cursor: 'pointer', fontSize: 13 }}>Mark Under Maintenance</button>}
        {asset.status !== 'retired' && <button onClick={() => updateStatus('retired')} style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid #ddd', background: '#f5f5f5', color: '#424242', cursor: 'pointer', fontSize: 13 }}>Retire Asset</button>}
        <Link href={'/dashboard/work-orders/new?asset_id=' + asset.id}>
          <button style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: '#1a1a2e', color: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>+ New Work Order</button>
        </Link>
      </div>

      <div style={{ borderBottom: '1px solid #eee', marginBottom: '1rem', display: 'flex', flexWrap: 'wrap' }}>
        <button style={tabStyle(activeTab === 'details')} onClick={() => setActiveTab('details')}>Details</button>
        <button style={tabStyle(activeTab === 'workorders')} onClick={() => setActiveTab('workorders')}>Work Orders ({workOrders.length})</button>
        <button style={tabStyle(activeTab === 'pm')} onClick={() => setActiveTab('pm')}>PM Schedules ({pmSchedules.length})</button>
        <button style={tabStyle(activeTab === 'photos')} onClick={() => setActiveTab('photos')}>Photos ({photos.length})</button>
        <button style={tabStyle(activeTab === 'qr')} onClick={() => setActiveTab('qr')}>QR Code</button>
      </div>

      {activeTab === 'details' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            {[
              { label: 'Site', value: asset.site?.name ?? '—' },
              { label: 'Sub-location', value: asset.sub_location ?? '—' },
              { label: 'Location Notes', value: asset.location_notes ?? '—' },
              { label: 'Category', value: asset.category ?? '—' },
              { label: 'Manufacturer', value: asset.manufacturer ?? '—' },
              { label: 'Model', value: asset.model ?? '—' },
              { label: 'Serial Number', value: asset.serial_number ?? '—' },
              { label: 'Purchase Date', value: asset.purchase_date ? format(new Date(asset.purchase_date), 'dd MMM yyyy') : '—' },
              { label: 'Purchase Cost', value: asset.purchase_cost ? 'SAR ' + Number(asset.purchase_cost).toLocaleString() : '—' },
              { label: 'Warranty Expiry', value: asset.warranty_expiry ? format(new Date(asset.warranty_expiry), 'dd MMM yyyy') : '—' },
              { label: 'Expected Lifespan', value: asset.expected_lifespan_years ? asset.expected_lifespan_years + ' years' : '—' },
              { label: 'Lifecycle Cost (closed WOs)', value: lifecycleCost > 0 ? 'SAR ' + lifecycleCost.toLocaleString() : '—' },
            ].map(({ label, value }) => (
              <div key={label} style={cardStyle}>
                <p style={{ fontSize: 12, color: '#999', margin: '0 0 4px' }}>{label}</p>
                <p style={{ fontSize: 14, fontWeight: 500, margin: 0 }}>{value}</p>
              </div>
            ))}
          </div>
          {asset.description && (
            <div style={{ ...cardStyle, marginTop: 4 }}>
              <p style={{ fontSize: 12, color: '#999', margin: '0 0 6px' }}>Description</p>
              <p style={{ fontSize: 14, margin: 0, lineHeight: 1.6 }}>{asset.description}</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'workorders' && (
        <div>
          {workOrders.length === 0 ? (
            <p style={{ fontSize: 13, color: '#999' }}>No work orders raised for this asset yet.</p>
          ) : (
            <div style={{ border: '1px solid #eee', borderRadius: 12, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f9f9f9', borderBottom: '1px solid #eee' }}>
                    {['Title','Priority','Status','Assigned To','Created'].map(h => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 12, fontWeight: 500, color: '#666' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {workOrders.map((wo, i) => {
                    const woCfg = woStatusConfig[wo.status] ?? woStatusConfig.new
                    return (
                      <tr key={wo.id} style={{ borderBottom: '1px solid #f0f0f0', background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                        <td style={{ padding: '10px 16px' }}>
                          <Link href={'/dashboard/work-orders/' + wo.id} style={{ color: '#1a1a2e', fontWeight: 500, textDecoration: 'none', fontSize: 13 }}>{wo.title}</Link>
                        </td>
                        <td style={{ padding: '10px 16px', fontSize: 12, fontWeight: 500, color: wo.priority === 'critical' ? '#b71c1c' : wo.priority === 'high' ? '#e65100' : wo.priority === 'medium' ? '#f57f17' : '#2e7d32' }}>
                          {wo.priority.charAt(0).toUpperCase() + wo.priority.slice(1)}
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          <span style={{ background: woCfg.bg, color: woCfg.color, padding: '2px 8px', borderRadius: 10, fontSize: 12, fontWeight: 500 }}>
                            {wo.status.replace('_',' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
                          </span>
                        </td>
                        <td style={{ padding: '10px 16px', fontSize: 13, color: '#666' }}>{wo.assignee?.full_name ?? 'Unassigned'}</td>
                        <td style={{ padding: '10px 16px', fontSize: 13, color: '#666' }}>{format(new Date(wo.created_at), 'dd MMM yyyy')}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'pm' && (
        <div>
          {pmSchedules.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#999' }}>
              <p style={{ fontSize: 14, marginBottom: 12 }}>No PM schedules linked to this asset yet.</p>
              <Link href='/dashboard/pm-schedules/new'>
                <button style={{ padding: '8px 20px', background: '#1a1a2e', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>+ Create PM Schedule</button>
              </Link>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {pmSchedules.map(pm => (
                <div key={pm.id} style={{ background: '#f9f9f9', borderRadius: 8, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 500, margin: 0 }}>{pm.title}</p>
                    <p style={{ fontSize: 12, color: '#999', margin: '4px 0 0' }}>
                      {pm.frequency.charAt(0).toUpperCase() + pm.frequency.slice(1)} · {pm.assignee?.full_name ?? 'Unassigned'}
                      {pm.next_due_at && ' · Next due: ' + format(new Date(pm.next_due_at), 'dd MMM yyyy')}
                    </p>
                  </div>
                  <span style={{ background: pm.is_active ? '#e8f5e9' : '#f5f5f5', color: pm.is_active ? '#2e7d32' : '#666', padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 500 }}>
                    {pm.is_active ? 'Active' : 'Paused'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'photos' && (
        <div>
          {photos.length === 0 ? (
            <p style={{ fontSize: 13, color: '#999' }}>No photos attached to this asset.</p>
          ) : (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {photos.map((url: string, i: number) => (
                <img key={i} src={url} alt={'Photo ' + (i+1)} style={{ width: 150, height: 150, objectFit: 'cover', borderRadius: 8, border: '1px solid #eee' }} />
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'qr' && (
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <p style={{ fontSize: 13, color: '#666', marginBottom: '1.5rem' }}>Scan this QR code to open this asset on any device. Print and attach it physically to the asset.</p>
          <div style={{ display: 'inline-block', padding: '1.5rem', border: '1px solid #eee', borderRadius: 12, background: 'white', marginBottom: '1rem' }}>
            <img src={'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent(typeof window !== 'undefined' ? window.location.origin + '/dashboard/assets/' + asset.id : '')} alt='QR Code' width={200} height={200} />
          </div>
          <p style={{ fontSize: 12, color: '#999', fontFamily: 'monospace' }}>{asset.qr_code}</p>
          <p style={{ fontSize: 13, color: '#666', marginTop: 8 }}>{asset.name} · {asset.site?.name ?? 'No site'}</p>
          <button onClick={() => window.print()} style={{ marginTop: '1rem', padding: '8px 20px', background: '#1a1a2e', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>Print QR Code</button>
        </div>
      )}
    </div>
  )
}"""

with open('src/app/dashboard/assets/new/page.tsx', 'w', encoding='utf-8') as f:
    f.write(new_asset)
print('assets/new/page.tsx written')

with open('src/app/dashboard/assets/[id]/page.tsx', 'w', encoding='utf-8') as f:
    f.write(asset_detail)
print('assets/[id]/page.tsx written')
