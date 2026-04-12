'use client'

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
}