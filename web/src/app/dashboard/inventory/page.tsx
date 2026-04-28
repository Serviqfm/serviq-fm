'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useLanguage } from '@/context/LanguageContext'
import Link from 'next/link'
import { C, F, pageStyle, cardStyle, primaryBtn, inputStyle, tableHeaderCell, tableCell, dangerBtn } from '@/lib/brand'

export default function InventoryPage() {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [deleting, setDeleting] = useState(false)
  const supabase = createClient()
  const { t } = useLanguage()

  useEffect(() => { fetchItems() }, [])

  async function fetchItems() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setLoading(false)
      if (typeof window !== 'undefined') window.location.href = '/login'
      return
    }
    const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
    if (!profile) { setLoading(false); return }
    const { data } = await supabase.from('inventory_items').select('*, site:site_id(name)').eq('organisation_id', profile.organisation_id).order('name', { ascending: true })
    if (data) setItems(data)
    setLoading(false)
  }

  async function deleteSelected() {
    if (!confirm(t('common.confirm_delete') + ' (' + selected.length + ')')) return
    setDeleting(true)
    await supabase.from('inventory_items').delete().in('id', selected)
    setSelected([])
    await fetchItems()
    setDeleting(false)
  }

  async function deleteOne(id: string) {
    if (!confirm(t('common.confirm_delete'))) return
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
    <div style={{ ...pageStyle, maxWidth: 1100 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: C.navy, fontFamily: F.en, margin: 0 }}>{t('inv.title')}</h1>
          <p style={{ fontSize: 13, color: C.textLight, fontFamily: F.en, margin: '4px 0 0' }}>
            {items.length} {t('inv.title').toLowerCase()}
            {lowStockItems.length > 0 && <span style={{ color: C.danger, marginLeft: 8 }}>· {lowStockItems.length} {t('inv.status.low')}</span>}
          </p>
        </div>
        <Link href='/dashboard/inventory/new'>
          <button style={primaryBtn}>{t('btn.add_item')}</button>
        </Link>
      </div>

      {lowStockItems.length > 0 && (
        <div style={{ background: C.dangerBg, border: `1px solid ${C.dangerBorder}`, borderRadius: 10, padding: '12px 16px', marginBottom: '1.5rem' }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: C.danger, margin: '0 0 6px', fontFamily: F.en }}>{t('inv.low_stock')}</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {lowStockItems.map(i => (
              <Link key={i.id} href={'/dashboard/inventory/' + i.id}>
                <span style={{ fontSize: 12, background: C.white, border: `1px solid ${C.dangerBorder}`, color: C.danger, padding: '3px 10px', borderRadius: 8, cursor: 'pointer', fontFamily: F.en }}>
                  {i.name} ({i.stock_quantity} {i.unit})
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('inv.search')} style={{ ...inputStyle, marginBottom: '1rem' }} />

      {selected.length > 0 && (
        <div style={{ background: C.dangerBg, border: `1px solid ${C.dangerBorder}`, borderRadius: 10, padding: '10px 16px', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: C.danger, fontFamily: F.en }}>{selected.length} {t('common.selected') || 'selected'}</span>
          <button onClick={deleteSelected} disabled={deleting} style={{ ...dangerBtn, padding: '6px 16px', fontSize: 12 }}>
            {deleting ? t('common.loading') : t('btn.delete_selected')}
          </button>
          <button onClick={() => setSelected([])} style={{ padding: '6px 12px', borderRadius: 7, border: `1px solid ${C.dangerBorder}`, background: C.white, cursor: 'pointer', fontSize: 12, color: C.textMid, fontFamily: F.en }}>{t('common.cancel')}</button>
        </div>
      )}

      {loading ? (
        <p style={{ color: C.textLight, fontFamily: F.en }}>{t('common.loading')}</p>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: C.textLight, fontFamily: F.en }}>
          <p style={{ fontSize: 18, marginBottom: 8 }}>{t('inv.title')}</p>
        </div>
      ) : (
        <div style={{ ...cardStyle, overflow: 'hidden', padding: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: C.pageBg, borderBottom: `1px solid ${C.border}` }}>
                <th style={{ padding: '10px 16px', width: 40 }}>
                  <input type='checkbox' checked={selected.length === filtered.length && filtered.length > 0} onChange={toggleSelectAll} />
                </th>
                {[t('inv.col.name'), t('inv.col.sku'), t('inv.col.cat'), t('inv.col.location'), t('inv.col.stock'), t('inv.col.min'), t('inv.col.cost'), t('common.status'), t('common.actions')].map(h => (
                  <th key={h} style={tableHeaderCell}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => {
                const isLow = item.stock_quantity <= item.minimum_stock_level && item.minimum_stock_level > 0
                const isOut = item.stock_quantity === 0
                return (
                  <tr key={item.id} style={{ background: selected.includes(item.id) ? '#EEF2FF' : isLow ? '#FFF8F8' : C.white }}>
                    <td style={{ padding: '12px 16px' }}>
                      <input type='checkbox' checked={selected.includes(item.id)} onChange={() => toggleSelect(item.id)} />
                    </td>
                    <td style={tableCell}>
                      <Link href={'/dashboard/inventory/' + item.id} style={{ color: C.navy, fontWeight: 500, textDecoration: 'none', fontSize: 14, fontFamily: F.en }}>{item.name}</Link>
                      {item.name_ar && <p style={{ fontSize: 11, color: C.textLight, margin: '2px 0 0', direction: 'rtl', fontFamily: F.ar }}>{item.name_ar}</p>}
                    </td>
                    <td style={{ ...tableCell, fontFamily: 'monospace' }}>{item.sku ?? '—'}</td>
                    <td style={tableCell}>{item.category ?? '—'}</td>
                    <td style={tableCell}>{item.location_in_store ?? item.site?.name ?? '—'}</td>
                    <td style={tableCell}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: isOut ? C.danger : isLow ? C.warning : C.success, fontFamily: F.en }}>
                        {item.stock_quantity} {item.unit}
                      </span>
                    </td>
                    <td style={tableCell}>{item.minimum_stock_level} {item.unit}</td>
                    <td style={tableCell}>{item.unit_cost ? 'SAR ' + Number(item.unit_cost).toLocaleString() : '—'}</td>
                    <td style={tableCell}>
                      <span style={{ background: isOut ? C.dangerBg : isLow ? '#FEF3C7' : '#DCFCE7', color: isOut ? C.danger : isLow ? C.warning : C.success, padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 500, fontFamily: F.en }}>
                        {isOut ? t('inv.status.out') : isLow ? t('inv.status.low') : t('inv.status.in')}
                      </span>
                    </td>
                    <td style={tableCell}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <Link href={'/dashboard/inventory/' + item.id + '/edit'}>
                          <button style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.white, cursor: 'pointer', fontSize: 11, fontFamily: F.en }}>{t('common.edit')}</button>
                        </Link>
                        <button onClick={() => deleteOne(item.id)} style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${C.dangerBorder}`, background: C.dangerBg, color: C.danger, cursor: 'pointer', fontSize: 11, fontFamily: F.en }}>{t('common.delete')}</button>
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
