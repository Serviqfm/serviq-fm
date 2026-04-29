'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useLanguage } from '@/context/LanguageContext'
import Link from 'next/link'
import { C, F, pageStyle, cardStyle, primaryBtn, tableHeaderCell, tableCell, dangerBtn } from '@/lib/brand'

export default function VendorsPage() {
  const [vendors, setVendors] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [deleting, setDeleting] = useState(false)
  const supabase = createClient()
  const { t } = useLanguage()

  useEffect(() => { fetchVendors() }, [])

  async function fetchVendors() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setLoading(false)
      if (typeof window !== 'undefined') window.location.href = '/login'
      return
    }
    const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
    if (!profile) { setLoading(false); return }
    const { data } = await supabase.from('vendors').select('*').eq('organisation_id', profile.organisation_id).order('company_name', { ascending: true })
    if (data) setVendors(data)
    setLoading(false)
  }

  async function deleteSelected() {
    if (!confirm(t('common.confirm_delete'))) return
    setDeleting(true)
    await supabase.from('vendors').delete().in('id', selected)
    setSelected([])
    await fetchVendors()
    setDeleting(false)
  }

  async function deleteOne(id: string) {
    if (!confirm(t('common.confirm_delete'))) return
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
    <div style={{ ...pageStyle, maxWidth: 1100 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: C.navy, fontFamily: F.en, margin: 0 }}>{t('vendors.title')}</h1>
          <p style={{ fontSize: 13, color: C.textLight, fontFamily: F.en, margin: '4px 0 0' }}>{vendors.length} {t('vendors.title').toLowerCase()}</p>
        </div>
        <Link href='/dashboard/vendors/new'>
          <button style={primaryBtn}>{t('btn.add_vendor')}</button>
        </Link>
      </div>

      <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('vendors.search')} style={{ ...inputStyle, marginBottom: '1rem' }} />

      {selected.length > 0 && (
        <div style={{ background: C.dangerBg, border: `1px solid ${C.dangerBorder}`, borderRadius: 10, padding: '10px 16px', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: C.danger, fontFamily: F.en }}>{selected.length} {t('common.selected')}</span>
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
          <p style={{ fontSize: 18, marginBottom: 8 }}>{t('vendors.title')}</p>
        </div>
      ) : (
        <div style={{ ...cardStyle, overflow: 'hidden', padding: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: C.pageBg, borderBottom: `1px solid ${C.border}` }}>
                <th style={{ padding: '10px 16px', width: 40 }}>
                  <input type='checkbox' checked={selected.length === filtered.length && filtered.length > 0} onChange={toggleSelectAll} />
                </th>
                {[t('vendors.col.company'), t('vendors.col.contact'), t('vendors.col.phone'), t('vendors.col.spec'), t('vendors.col.rating'), t('common.status'), t('common.actions')].map(h => (
                  <th key={h} style={tableHeaderCell}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((v) => (
                <tr key={v.id} style={{ background: selected.includes(v.id) ? '#EEF2FF' : C.white }}>
                  <td style={{ padding: '12px 16px' }}>
                    <input type='checkbox' checked={selected.includes(v.id)} onChange={() => toggleSelect(v.id)} />
                  </td>
                  <td style={tableCell}>
                    <Link href={'/dashboard/vendors/' + v.id} style={{ color: C.navy, fontWeight: 500, textDecoration: 'none', fontSize: 14, fontFamily: F.en }}>{v.company_name}</Link>
                    {v.company_name_ar && <p style={{ fontSize: 11, color: C.textLight, margin: '2px 0 0', direction: 'rtl', fontFamily: F.ar }}>{v.company_name_ar}</p>}
                  </td>
                  <td style={tableCell}>{v.contact_name ?? '—'}</td>
                  <td style={tableCell}>{v.phone ?? '—'}</td>
                  <td style={tableCell}>{v.specialisation ?? '—'}</td>
                  <td style={{ ...tableCell, color: C.warning, fontSize: 14 }}>{stars(v.average_rating)}</td>
                  <td style={tableCell}>
                    <span style={{ background: v.is_active ? '#DCFCE7' : C.pageBg, color: v.is_active ? C.success : C.textMid, padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 500, fontFamily: F.en }}>
                      {v.is_active ? t('common.active') : t('common.inactive')}
                    </span>
                  </td>
                  <td style={tableCell}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Link href={'/dashboard/vendors/' + v.id}>
                        <button style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.white, cursor: 'pointer', fontSize: 11, fontFamily: F.en }}>{t('common.view')}</button>
                      </Link>
                      <Link href={'/dashboard/vendors/' + v.id + '/edit'}>
                        <button style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.white, cursor: 'pointer', fontSize: 11, fontFamily: F.en }}>{t('common.edit')}</button>
                      </Link>
                      <button onClick={() => toggleActive(v.id, v.is_active)} style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.white, cursor: 'pointer', fontSize: 11, color: C.textMid, fontFamily: F.en }}>
                        {v.is_active ? t('common.deactivate') : t('common.activate')}
                      </button>
                      <button onClick={() => deleteOne(v.id)} style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${C.dangerBorder}`, background: C.dangerBg, color: C.danger, cursor: 'pointer', fontSize: 11, fontFamily: F.en }}>{t('common.delete')}</button>
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
}
