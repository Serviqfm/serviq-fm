import os

# ── 1. Inventory list page ──
inventory_list = """'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'

export default function InventoryPage() {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [deleting, setDeleting] = useState(false)
  const supabase = createClient()

  useEffect(() => { fetchItems() }, [])

  async function fetchItems() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
    if (!profile) return
    const { data } = await supabase.from('inventory_items').select('*, site:site_id(name)').eq('organisation_id', profile.organisation_id).order('name', { ascending: true })
    if (data) setItems(data)
    setLoading(false)
  }

  async function deleteSelected() {
    if (!confirm('Delete ' + selected.length + ' item(s)?')) return
    setDeleting(true)
    await supabase.from('inventory_items').delete().in('id', selected)
    setSelected([])
    await fetchItems()
    setDeleting(false)
  }

  async function deleteOne(id: string) {
    if (!confirm('Delete this inventory item?')) return
    await supabase.from('inventory_items').delete().eq('id', id)
    fetchItems()
  }

  function toggleSelect(id: string) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function toggleSelectAll() {
    setSelected(prev => prev.length === filtered.length ? [] : filtered.map(i => i.id))
  }

  const filtered = items.filter(i =>
    i.name?.toLowerCase().includes(search.toLowerCase()) ||
    i.sku?.toLowerCase().includes(search.toLowerCase()) ||
    i.category?.toLowerCase().includes(search.toLowerCase())
  )

  const lowStockItems = items.filter(i => i.stock_quantity <= i.minimum_stock_level && i.minimum_stock_level > 0)

  return (
    <div style={{ padding: '2rem', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>Inventory</h1>
          <p style={{ fontSize: 13, color: '#999', margin: '4px 0 0' }}>
            {items.length} items
            {lowStockItems.length > 0 && <span style={{ color: '#c62828', marginLeft: 8 }}>· {lowStockItems.length} low stock</span>}
          </p>
        </div>
        <Link href='/dashboard/inventory/new'>
          <button style={{ background: '#1a1a2e', color: 'white', padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 500 }}>+ Add Item</button>
        </Link>
      </div>

      {lowStockItems.length > 0 && (
        <div style={{ background: '#fce4ec', border: '1px solid #ef9a9a', borderRadius: 10, padding: '12px 16px', marginBottom: '1.5rem' }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: '#b71c1c', margin: '0 0 6px' }}>Low Stock Alert</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {lowStockItems.map(i => (
              <Link key={i.id} href={'/dashboard/inventory/' + i.id}>
                <span style={{ fontSize: 12, background: 'white', border: '1px solid #ef9a9a', color: '#c62828', padding: '3px 10px', borderRadius: 8, cursor: 'pointer' }}>
                  {i.name} ({i.stock_quantity} {i.unit} left)
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <input value={search} onChange={e => setSearch(e.target.value)} placeholder='Search by name, SKU, or category...' style={{ width: '100%', padding: '9px 14px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, marginBottom: '1rem', boxSizing: 'border-box' }} />

      {selected.length > 0 && (
        <div style={{ background: '#fce4ec', border: '1px solid #ef9a9a', borderRadius: 10, padding: '10px 16px', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: '#b71c1c' }}>{selected.length} item(s) selected</span>
          <button onClick={deleteSelected} disabled={deleting} style={{ padding: '6px 16px', borderRadius: 7, border: 'none', background: '#c62828', color: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>
            {deleting ? 'Deleting...' : 'Delete Selected'}
          </button>
          <button onClick={() => setSelected([])} style={{ padding: '6px 12px', borderRadius: 7, border: '1px solid #ef9a9a', background: 'white', cursor: 'pointer', fontSize: 12, color: '#666' }}>Cancel</button>
        </div>
      )}

      {loading ? <p style={{ color: '#999' }}>Loading...</p> : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: '#999' }}>
          <p style={{ fontSize: 18, marginBottom: 8 }}>No inventory items yet</p>
          <p style={{ fontSize: 14 }}>Add parts and materials to track stock levels</p>
        </div>
      ) : (
        <div style={{ border: '1px solid #eee', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f9f9f9', borderBottom: '1px solid #eee' }}>
                <th style={{ padding: '12px 16px', width: 40 }}>
                  <input type='checkbox' checked={selected.length === filtered.length && filtered.length > 0} onChange={toggleSelectAll} />
                </th>
                {['Item Name','SKU','Category','Location','Stock','Min Stock','Unit Cost','Status','Actions'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 500, color: '#666' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((item, i) => {
                const isLow = item.stock_quantity <= item.minimum_stock_level && item.minimum_stock_level > 0
                const isOut = item.stock_quantity === 0
                return (
                  <tr key={item.id} style={{ borderBottom: '1px solid #f0f0f0', background: selected.includes(item.id) ? '#f3f4fd' : isLow ? '#fff8f8' : i % 2 === 0 ? 'white' : '#fafafa' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <input type='checkbox' checked={selected.includes(item.id)} onChange={() => toggleSelect(item.id)} />
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <Link href={'/dashboard/inventory/' + item.id} style={{ color: '#1a1a2e', fontWeight: 500, textDecoration: 'none', fontSize: 14 }}>{item.name}</Link>
                      {item.name_ar && <p style={{ fontSize: 11, color: '#999', margin: '2px 0 0', direction: 'rtl' }}>{item.name_ar}</p>}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: '#666', fontFamily: 'monospace' }}>{item.sku ?? '—'}</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: '#666' }}>{item.category ?? '—'}</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: '#666' }}>{item.location_in_store ?? item.site?.name ?? '—'}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: isOut ? '#b71c1c' : isLow ? '#f57f17' : '#2e7d32' }}>
                        {item.stock_quantity} {item.unit}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: '#666' }}>{item.minimum_stock_level} {item.unit}</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: '#666' }}>{item.unit_cost ? 'SAR ' + Number(item.unit_cost).toLocaleString() : '—'}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ background: isOut ? '#fce4ec' : isLow ? '#fff8e1' : '#e8f5e9', color: isOut ? '#b71c1c' : isLow ? '#f57f17' : '#2e7d32', padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 500 }}>
                        {isOut ? 'Out of Stock' : isLow ? 'Low Stock' : 'In Stock'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <Link href={'/dashboard/inventory/' + item.id + '/edit'}>
                          <button style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #ddd', background: 'white', cursor: 'pointer', fontSize: 11 }}>Edit</button>
                        </Link>
                        <button onClick={() => deleteOne(item.id)} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #ef9a9a', background: '#fce4ec', color: '#c62828', cursor: 'pointer', fontSize: 11 }}>Delete</button>
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

# ── 2. New inventory item ──
inventory_new = """'use client'

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
}"""

# ── 3. Inventory item edit page ──
inventory_edit = """'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'

export default function EditInventoryItemPage() {
  const router = useRouter()
  const { id } = useParams()
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [sites, setSites] = useState<any[]>([])
  const [form, setForm] = useState({
    name: '', name_ar: '', sku: '', category: '',
    unit: 'piece', stock_quantity: '0', minimum_stock_level: '0',
    unit_cost: '', location_in_store: '', site_id: '',
  })

  useEffect(() => { loadData() }, [id])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
    if (!profile) return
    const [{ data: item }, { data: siteData }] = await Promise.all([
      supabase.from('inventory_items').select('*').eq('id', id).single(),
      supabase.from('sites').select('id, name').eq('organisation_id', profile.organisation_id).eq('is_active', true),
    ])
    if (siteData) setSites(siteData)
    if (item) setForm({
      name: item.name ?? '',
      name_ar: item.name_ar ?? '',
      sku: item.sku ?? '',
      category: item.category ?? '',
      unit: item.unit ?? 'piece',
      stock_quantity: String(item.stock_quantity ?? 0),
      minimum_stock_level: String(item.minimum_stock_level ?? 0),
      unit_cost: item.unit_cost ? String(item.unit_cost) : '',
      location_in_store: item.location_in_store ?? '',
      site_id: item.site_id ?? '',
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
    const { error: updateError } = await supabase.from('inventory_items').update({
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
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    if (updateError) { setError(updateError.message); setSaving(false) }
    else router.push('/dashboard/inventory')
  }

  const fieldStyle = { width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' as const, background: 'white' }
  const labelStyle = { display: 'block' as const, marginBottom: 6, fontSize: 13, fontWeight: 500 as const, color: '#444' }

  if (loading) return <div style={{ padding: '2rem' }}>Loading...</div>

  return (
    <div style={{ padding: '2rem', maxWidth: 620, margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <a href='/dashboard/inventory' style={{ color: '#999', fontSize: 13, textDecoration: 'none' }}>Back to Inventory</a>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0.5rem 0 0' }}>Edit Inventory Item</h1>
      </div>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div>
          <label style={labelStyle}>Item Name (English) *</label>
          <input name='name' value={form.name} onChange={handleChange} required style={fieldStyle} />
        </div>
        <div>
          <label style={labelStyle}>Item Name (Arabic)</label>
          <input name='name_ar' value={form.name_ar} onChange={handleChange} style={{ ...fieldStyle, direction: 'rtl', textAlign: 'right' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>SKU / Part Number</label>
            <input name='sku' value={form.sku} onChange={handleChange} style={fieldStyle} />
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
            <input name='unit_cost' type='number' value={form.unit_cost} onChange={handleChange} min='0' step='0.01' style={fieldStyle} />
          </div>
          <div>
            <label style={labelStyle}>Storage Location</label>
            <input name='location_in_store' value={form.location_in_store} onChange={handleChange} style={fieldStyle} />
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
        <div style={{ display: 'flex', gap: 10 }}>
          <button type='submit' disabled={saving} style={{ flex: 1, background: '#1a1a2e', color: 'white', padding: '11px', borderRadius: 8, border: 'none', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 500, fontSize: 15, opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          <a href='/dashboard/inventory' style={{ flex: 1 }}>
            <button type='button' style={{ width: '100%', background: 'white', color: '#333', padding: '11px', borderRadius: 8, border: '1px solid #ddd', cursor: 'pointer', fontWeight: 500, fontSize: 15 }}>Cancel</button>
          </a>
        </div>
      </form>
    </div>
  )
}"""

# ── 4. Inventory item detail page ──
inventory_detail = """'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { format } from 'date-fns'
import { useParams } from 'next/navigation'
import Link from 'next/link'

export default function InventoryItemDetailPage() {
  const { id } = useParams()
  const supabase = createClient()
  const [item, setItem] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [adjustQty, setAdjustQty] = useState('')
  const [adjustNote, setAdjustNote] = useState('')
  const [adjusting, setAdjusting] = useState(false)

  useEffect(() => { fetchItem() }, [id])

  async function fetchItem() {
    const { data } = await supabase.from('inventory_items').select('*, site:site_id(name)').eq('id', id).single()
    if (data) setItem(data)
    setLoading(false)
  }

  async function adjustStock(direction: 'add' | 'remove') {
    if (!adjustQty || parseFloat(adjustQty) <= 0) return
    setAdjusting(true)
    const qty = parseFloat(adjustQty)
    const newQty = direction === 'add'
      ? (item.stock_quantity + qty)
      : Math.max(0, item.stock_quantity - qty)
    await supabase.from('inventory_items').update({
      stock_quantity: newQty,
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    setAdjustQty('')
    setAdjustNote('')
    await fetchItem()
    setAdjusting(false)
  }

  if (loading) return <div style={{ padding: '2rem' }}>Loading...</div>
  if (!item) return <div style={{ padding: '2rem' }}>Item not found.</div>

  const isLow = item.stock_quantity <= item.minimum_stock_level && item.minimum_stock_level > 0
  const isOut = item.stock_quantity === 0
  const stockColor = isOut ? '#b71c1c' : isLow ? '#f57f17' : '#2e7d32'
  const stockBg = isOut ? '#fce4ec' : isLow ? '#fff8e1' : '#e8f5e9'
  const totalValue = item.unit_cost ? (item.stock_quantity * item.unit_cost).toFixed(2) : null

  return (
    <div style={{ padding: '2rem', maxWidth: 760, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <a href='/dashboard/inventory' style={{ color: '#999', fontSize: 13, textDecoration: 'none' }}>Back to Inventory</a>
        <Link href={'/dashboard/inventory/' + id + '/edit'}>
          <button style={{ padding: '6px 16px', borderRadius: 7, border: '1px solid #ddd', background: 'white', cursor: 'pointer', fontSize: 13 }}>Edit Item</button>
        </Link>
      </div>

      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>{item.name}</h1>
        {item.name_ar && <p style={{ fontSize: 14, color: '#999', margin: '4px 0 0', direction: 'rtl', textAlign: 'left' }}>{item.name_ar}</p>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: '1.5rem' }}>
        <div style={{ background: stockBg, borderRadius: 12, padding: '1rem', border: '1px solid ' + (isOut ? '#ef9a9a' : isLow ? '#ffe082' : '#a5d6a7') }}>
          <p style={{ fontSize: 12, color: stockColor, margin: '0 0 6px', fontWeight: 500 }}>Current Stock</p>
          <p style={{ fontSize: 28, fontWeight: 700, margin: 0, color: stockColor }}>{item.stock_quantity} {item.unit}</p>
          <p style={{ fontSize: 12, margin: '4px 0 0', color: stockColor }}>{isOut ? 'Out of stock' : isLow ? 'Below minimum level' : 'In stock'}</p>
        </div>
        <div style={{ background: 'white', border: '1px solid #eee', borderRadius: 12, padding: '1rem' }}>
          <p style={{ fontSize: 12, color: '#999', margin: '0 0 6px', fontWeight: 500 }}>Minimum Level</p>
          <p style={{ fontSize: 28, fontWeight: 700, margin: 0, color: '#1a1a2e' }}>{item.minimum_stock_level} {item.unit}</p>
        </div>
        <div style={{ background: 'white', border: '1px solid #eee', borderRadius: 12, padding: '1rem' }}>
          <p style={{ fontSize: 12, color: '#999', margin: '0 0 6px', fontWeight: 500 }}>Total Value</p>
          <p style={{ fontSize: 22, fontWeight: 700, margin: 0, color: '#1a1a2e' }}>{totalValue ? 'SAR ' + Number(totalValue).toLocaleString() : '—'}</p>
          {item.unit_cost && <p style={{ fontSize: 12, color: '#999', margin: '4px 0 0' }}>SAR {Number(item.unit_cost).toLocaleString()} per {item.unit}</p>}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: '1.5rem' }}>
        {[
          { label: 'SKU / Part Number', value: item.sku ?? '—' },
          { label: 'Category', value: item.category ?? '—' },
          { label: 'Storage Location', value: item.location_in_store ?? '—' },
          { label: 'Site', value: item.site?.name ?? '—' },
        ].map(({ label, value }) => (
          <div key={label} style={{ background: '#f9f9f9', borderRadius: 8, padding: '12px 16px' }}>
            <p style={{ fontSize: 12, color: '#999', margin: '0 0 4px' }}>{label}</p>
            <p style={{ fontSize: 14, fontWeight: 500, margin: 0 }}>{value}</p>
          </div>
        ))}
      </div>

      <div style={{ background: 'white', border: '1px solid #eee', borderRadius: 12, padding: '1.25rem', marginBottom: '1.5rem' }}>
        <p style={{ fontSize: 14, fontWeight: 600, margin: '0 0 12px' }}>Adjust Stock</p>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 120 }}>
            <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4 }}>Quantity</label>
            <input
              type='number'
              value={adjustQty}
              onChange={e => setAdjustQty(e.target.value)}
              min='0'
              step='0.01'
              placeholder='0'
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ flex: 2, minWidth: 200 }}>
            <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 4 }}>Note (optional)</label>
            <input
              value={adjustNote}
              onChange={e => setAdjustNote(e.target.value)}
              placeholder='e.g. Used in WO #123, New delivery received'
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }}
            />
          </div>
          <button
            onClick={() => adjustStock('add')}
            disabled={adjusting || !adjustQty}
            style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#2e7d32', color: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 500, opacity: !adjustQty ? 0.5 : 1 }}
          >
            + Add Stock
          </button>
          <button
            onClick={() => adjustStock('remove')}
            disabled={adjusting || !adjustQty}
            style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#c62828', color: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 500, opacity: !adjustQty ? 0.5 : 1 }}
          >
            - Remove Stock
          </button>
        </div>
      </div>

      {isLow && (
        <div style={{ background: '#fff8e1', border: '1px solid #ffe082', borderRadius: 10, padding: '12px 16px' }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: '#f57f17', margin: '0 0 4px' }}>Low Stock Warning</p>
          <p style={{ fontSize: 13, color: '#666', margin: 0 }}>
            Current stock ({item.stock_quantity} {item.unit}) is at or below minimum level ({item.minimum_stock_level} {item.unit}).
            Consider raising a purchase order.
          </p>
        </div>
      )}
    </div>
  )
}"""

# Write all files
with open('src/app/dashboard/inventory/page.tsx', 'w', encoding='utf-8') as f:
    f.write(inventory_list)
print('inventory/page.tsx written')

with open('src/app/dashboard/inventory/new/page.tsx', 'w', encoding='utf-8') as f:
    f.write(inventory_new)
print('inventory/new/page.tsx written')

with open('src/app/dashboard/inventory/[id]/edit/page.tsx', 'w', encoding='utf-8') as f:
    f.write(inventory_edit)
print('inventory/[id]/edit/page.tsx written')

with open('src/app/dashboard/inventory/[id]/page.tsx', 'w', encoding='utf-8') as f:
    f.write(inventory_detail)
print('inventory/[id]/page.tsx written')

print('All inventory files written successfully')