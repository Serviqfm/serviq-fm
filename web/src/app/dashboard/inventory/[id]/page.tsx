'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
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
}