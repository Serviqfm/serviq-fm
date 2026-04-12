'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function NewInventoryItemPage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sites, setSites] = useState<any[]>([])
  const [form, setForm] = useState({
    name: '', name_ar: '', sku: '', category: '',
    unit: 'piece', stock_quantity: '0', minimum_stock_level: '0',
    unit_cost: '', location_in_store: '', site_id: '',
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
    const { error: insertError } = await supabase.from('inventory_items').insert({
      name: form.name,
      name_ar: form.name_ar || null,
      sku: form.sku || null,
      category: form.category || null,
      unit: form.unit,
      stock_quantity: parseFloat(form.stock_quantity) || 0,
      minimum_stock_level: parseFloat(form.minimum_stock_level) || 0,
      unit_cost: form.unit_cost ? parseFloat(form.unit_cost) : null,
      location_in_store: form.location_in_store || null,
      site_id: form.site_id || null,
      organisation_id: profile.organisation_id,
      is_active: true,
    })
    if (insertError) { setError(insertError.message); setLoading(false) }
    else router.push('/dashboard/inventory')
  }

  const fieldStyle = { width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' as const, background: 'white' }
  const labelStyle = { display: 'block' as const, marginBottom: 6, fontSize: 13, fontWeight: 500 as const, color: '#444' }

  return (
    <div style={{ padding: '2rem', maxWidth: 620, margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <a href='/dashboard/inventory' style={{ color: '#999', fontSize: 13, textDecoration: 'none' }}>Back to Inventory</a>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0.5rem 0 0' }}>Add Inventory Item</h1>
      </div>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div>
          <label style={labelStyle}>Item Name (English) *</label>
          <input name='name' value={form.name} onChange={handleChange} required placeholder='e.g. AC Filter 24 inch' style={fieldStyle} />
        </div>
        <div>
          <label style={labelStyle}>Item Name (Arabic)</label>
          <input name='name_ar' value={form.name_ar} onChange={handleChange} placeholder='اسم العنصر بالعربية' style={{ ...fieldStyle, direction: 'rtl', textAlign: 'right' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>SKU / Part Number</label>
            <input name='sku' value={form.sku} onChange={handleChange} placeholder='e.g. AC-FLT-24' style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>Category</label>
            <select name='category' value={form.category} onChange={handleChange} style={fieldStyle}>
              <option value=''>Select category</option>
              <option value='HVAC Parts'>HVAC Parts</option>
              <option value='Electrical'>Electrical</option>
              <option value='Plumbing'>Plumbing</option>
              <option value='Cleaning Supplies'>Cleaning Supplies</option>
              <option value='Safety Equipment'>Safety Equipment</option>
              <option value='Tools'>Tools</option>
              <option value='Lighting'>Lighting</option>
              <option value='Pool Chemicals'>Pool Chemicals</option>
              <option value='General Supplies'>General Supplies</option>
              <option value='Other'>Other</option>
            </select>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>Unit *</label>
            <select name='unit' value={form.unit} onChange={handleChange} style={fieldStyle}>
              <option value='piece'>Piece</option>
              <option value='box'>Box</option>
              <option value='litre'>Litre</option>
              <option value='kg'>KG</option>
              <option value='metre'>Metre</option>
              <option value='roll'>Roll</option>
              <option value='set'>Set</option>
              <option value='pair'>Pair</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Current Stock *</label>
            <input name='stock_quantity' type='number' value={form.stock_quantity} onChange={handleChange} min='0' step='0.01' style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>Minimum Stock Level</label>
            <input name='minimum_stock_level' type='number' value={form.minimum_stock_level} onChange={handleChange} min='0' step='0.01' style={fieldStyle} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>Unit Cost (SAR)</label>
            <input name='unit_cost' type='number' value={form.unit_cost} onChange={handleChange} placeholder='e.g. 45.00' min='0' step='0.01' style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>Storage Location</label>
            <input name='location_in_store' value={form.location_in_store} onChange={handleChange} placeholder='e.g. Store Room A, Shelf 3' style={fieldStyle} />
          </div>
        </div>
        <div>
          <label style={labelStyle}>Site</label>
          <select name='site_id' value={form.site_id} onChange={handleChange} style={fieldStyle}>
            <option value=''>Select site</option>
            {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        {error && <p style={{ color: 'red', fontSize: 13, margin: 0 }}>{error}</p>}
        <button type='submit' disabled={loading} style={{ background: '#1a1a2e', color: 'white', padding: '11px', borderRadius: 8, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 500, fontSize: 15, opacity: loading ? 0.7 : 1 }}>
          {loading ? 'Saving...' : 'Save Item'}
        </button>
      </form>
    </div>
  )
}