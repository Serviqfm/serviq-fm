'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { format } from 'date-fns'
import Link from 'next/link'
import { useLanguage } from '@/context/LanguageContext'
import { C, F, pageStyle, cardStyle, primaryBtn, secondaryBtn, inputStyle, tableHeaderCell, tableCell, dangerBtn } from '@/lib/brand'

export default function AssetsPage() {
  const [assets, setAssets] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selected, setSelected] = useState<string[]>([])
  const [deleting, setDeleting] = useState(false)
  const supabase = createClient()
  const { t } = useLanguage()

  useEffect(() => { fetchAssets() }, [categoryFilter, statusFilter])

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
  }

  async function fetchAssets() {
    setLoading(true)
    let query = supabase.from('assets').select('*, site:site_id(name)').order('created_at', { ascending: false })
    if (statusFilter !== 'all') query = query.eq('status', statusFilter)
    if (categoryFilter !== 'all') query = query.eq('category', categoryFilter)
    const { data, error } = await query
    if (!error && data) setAssets(data)
    setLoading(false)
  }

  const filtered = assets.filter(a =>
    a.name?.toLowerCase().includes(search.toLowerCase()) ||
    a.serial_number?.toLowerCase().includes(search.toLowerCase()) ||
    a.manufacturer?.toLowerCase().includes(search.toLowerCase()) ||
    a.site?.name?.toLowerCase().includes(search.toLowerCase())
  )

  const statusConfig: Record<string, { bg: string; color: string; label: string }> = {
    active:            { bg: '#DCFCE7', color: C.success, label: t('assets.status.active') },
    under_maintenance: { bg: '#FEF3C7', color: C.warning, label: t('assets.status.under_maintenance') },
    retired:           { bg: '#F1F5F9', color: C.textMid, label: 'Retired' },
  }

  const categories = ['HVAC','Electrical','Plumbing','Elevator / Lift','Fire Safety','Furniture','Kitchen Equipment','Pool / Gym','IT Equipment','Signage','Vehicle','Other']

  const btnStyle = (active: boolean) => ({
    padding: '6px 14px', borderRadius: 20,
    border: `1px solid ${active ? C.navy : C.border}`,
    background: active ? C.navy : C.white,
    color: active ? C.white : C.textMid,
    cursor: 'pointer', fontSize: 13, fontWeight: 500 as const,
    fontFamily: F.en,
  })

  const isWarrantyExpiringSoon = (date: string) => {
    if (!date) return false
    const days = Math.ceil((new Date(date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
    return days <= 30 && days >= 0
  }

  const isWarrantyExpired = (date: string) => {
    if (!date) return false
    return new Date(date) < new Date()
  }

  return (
    <div style={pageStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: C.navy, fontFamily: F.en, margin: 0 }}>{t('assets.title')}</h1>
          <p style={{ fontSize: 13, color: C.textLight, fontFamily: F.en, margin: '4px 0 0' }}>{assets.length} total assets registered</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href='/dashboard/assets/import'>
            <button style={secondaryBtn}>{t('btn.import')}</button>
          </Link>
          <Link href='/dashboard/assets/export'>
            <button style={secondaryBtn}>{t('btn.export')}</button>
          </Link>
          <Link href='/dashboard/assets/new'>
            <button style={primaryBtn}>{t('btn.add_asset')}</button>
          </Link>
        </div>
      </div>

      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder={t('assets.search')}
        style={{ ...inputStyle, marginBottom: '1rem' }}
      />

      <div style={{ display: 'flex', gap: 8, marginBottom: '0.75rem', flexWrap: 'wrap' }}>
        {['all','active','under_maintenance','retired'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)} style={btnStyle(statusFilter === s)}>
            {s === 'all' ? t('common.all') : s === 'active' ? t('assets.status.active') : s === 'under_maintenance' ? t('assets.status.under_maintenance') : t('assets.status.retired')}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <button onClick={() => setCategoryFilter('all')} style={{ ...btnStyle(categoryFilter === 'all'), fontSize: 12, padding: '4px 12px' }}>{t('filter.all_cats')}</button>
        {categories.map(c => (
          <button key={c} onClick={() => setCategoryFilter(c)} style={{ ...btnStyle(categoryFilter === c), fontSize: 12, padding: '4px 12px' }}>
            {c === 'HVAC' ? t('cat.hvac') : c === 'Electrical' ? t('cat.electrical') : c === 'Plumbing' ? t('cat.plumbing') : c === 'Elevator / Lift' ? t('cat.elevator') : c === 'Fire Safety' ? t('cat.fire') : c === 'Furniture' ? t('cat.furniture') : c === 'Kitchen Equipment' ? t('cat.kitchen') : c === 'Pool / Gym' ? t('cat.pool') : c === 'IT Equipment' ? t('cat.it') : c === 'Signage' ? t('cat.signage') : c === 'Vehicle' ? t('cat.vehicle') : t('cat.other')}
          </button>
        ))}
      </div>

      {selected.length > 0 && (
        <div style={{ background: C.dangerBg, border: `1px solid ${C.dangerBorder}`, borderRadius: 10, padding: '10px 16px', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: C.danger, fontFamily: F.en }}>{selected.length} asset(s) selected</span>
          <button onClick={deleteSelected} disabled={deleting} style={{ ...dangerBtn, padding: '6px 16px', fontSize: 12 }}>
            {deleting ? 'Deleting...' : t('btn.delete_selected')}
          </button>
          <button onClick={() => setSelected([])} style={{ padding: '6px 12px', borderRadius: 7, border: `1px solid ${C.dangerBorder}`, background: C.white, cursor: 'pointer', fontSize: 12, color: C.textMid, fontFamily: F.en }}>Cancel</button>
        </div>
      )}

      {loading ? (
        <p style={{ color: C.textLight, fontFamily: F.en }}>Loading...</p>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: C.textLight, fontFamily: F.en }}>
          <p style={{ fontSize: 18, marginBottom: 8 }}>No assets found</p>
          <p style={{ fontSize: 14 }}>Add your first asset to get started</p>
        </div>
      ) : (
        <div style={{ ...cardStyle, overflow: 'hidden', padding: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: C.pageBg, borderBottom: `1px solid ${C.border}` }}>
                <th style={{ padding: '10px 16px', width: 40 }}>
                  <input type='checkbox' checked={selected.length === filtered.length && filtered.length > 0} onChange={toggleSelectAll} />
                </th>
                {[t('assets.col.name'),t('assets.col.cat'),t('common.site'),t('assets.col.serial'),t('common.status'),t('assets.col.warranty'),t('assets.col.added'),t('common.actions')].map(h => (
                  <th key={h} style={tableHeaderCell}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((asset) => {
                const sCfg = statusConfig[asset.status] ?? statusConfig.active
                const warningSoon = isWarrantyExpiringSoon(asset.warranty_expiry)
                const expired = isWarrantyExpired(asset.warranty_expiry)
                return (
                  <tr key={asset.id} style={{ background: selected.includes(asset.id) ? '#EEF2FF' : C.white }}>
                    <td style={{ padding: '12px 16px' }}>
                      <input type='checkbox' checked={selected.includes(asset.id)} onChange={() => toggleSelect(asset.id)} />
                    </td>
                    <td style={tableCell}>
                      <Link href={'/dashboard/assets/' + asset.id} style={{ color: C.navy, fontWeight: 500, textDecoration: 'none', fontSize: 14, fontFamily: F.en }}>
                        {asset.name}
                      </Link>
                      {asset.manufacturer && <p style={{ fontSize: 12, color: C.textLight, fontFamily: F.en, margin: '2px 0 0' }}>{asset.manufacturer} {asset.model}</p>}
                    </td>
                    <td style={tableCell}>{asset.category ?? '—'}</td>
                    <td style={tableCell}>{asset.site?.name ?? '—'}</td>
                    <td style={{ ...tableCell, fontFamily: 'monospace' }}>{asset.serial_number ?? '—'}</td>
                    <td style={tableCell}>
                      <span style={{ background: sCfg.bg, color: sCfg.color, padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 500, fontFamily: F.en }}>{sCfg.label}</span>
                    </td>
                    <td style={tableCell}>
                      {asset.warranty_expiry ? (
                        <span style={{ color: expired ? C.danger : warningSoon ? C.warning : C.textMid, fontFamily: F.en }}>
                          {format(new Date(asset.warranty_expiry), 'dd MMM yyyy')}
                          {expired && ' (Expired)'}
                          {warningSoon && !expired && ' (Expiring soon)'}
                        </span>
                      ) : '—'}
                    </td>
                    <td style={tableCell}>{format(new Date(asset.created_at), 'dd MMM yyyy')}</td>
                    <td style={tableCell}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <a href={'/dashboard/assets/' + asset.id + '/edit'}>
                          <button style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.white, cursor: 'pointer', fontSize: 11, fontFamily: F.en }}>{t('common.edit')}</button>
                        </a>
                        <button onClick={() => deleteOne(asset.id)} style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${C.dangerBorder}`, background: C.dangerBg, color: C.danger, cursor: 'pointer', fontSize: 11, fontFamily: F.en }}>{t('common.delete')}</button>
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
