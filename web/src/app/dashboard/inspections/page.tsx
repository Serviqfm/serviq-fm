'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { format } from 'date-fns'
import Link from 'next/link'
import { useLanguage } from '@/context/LanguageContext'
import { C, F, pageStyle, cardStyle, primaryBtn, secondaryBtn, tableHeaderCell, tableCell, dangerBtn } from '@/lib/brand'

export default function InspectionsPage() {
  const [inspections, setInspections] = useState<any[]>([])
  const [templates, setTemplates] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'inspections' | 'templates'>('inspections')
  const [selected, setSelected] = useState<string[]>([])
  const [deleting, setDeleting] = useState(false)
  const supabase = createClient()
  const { t, lang } = useLanguage()

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
    if (!profile) { setLoading(false); return }

    const [{ data: inspData }, { data: tmplData }] = await Promise.all([
      supabase.from('inspection_results')
        .select('*, template:template_id(name, vertical), site:site_id(name), asset:asset_id(name), inspector:conducted_by(full_name)')
        .eq('organisation_id', profile.organisation_id)
        .order('created_at', { ascending: false }),
      supabase.from('inspection_templates')
        .select('*')
        .eq('organisation_id', profile.organisation_id)
        .order('created_at', { ascending: false }),
    ])

    if (inspData) setInspections(inspData)
    if (tmplData) setTemplates(tmplData)
    setLoading(false)
  }

  async function deleteInspection(id: string) {
    if (!confirm(t('common.confirm_delete'))) return
    await supabase.from('inspection_results').delete().eq('id', id)
    fetchAll()
  }

  async function deleteTemplate(id: string) {
    if (!confirm(t('common.confirm_delete'))) return
    await supabase.from('inspection_templates').delete().eq('id', id)
    fetchAll()
  }

  async function deleteSelected() {
    if (!confirm(t('common.confirm_delete'))) return
    setDeleting(true)
    if (activeTab === 'inspections') {
      await supabase.from('inspection_results').delete().in('id', selected)
    } else {
      await supabase.from('inspection_templates').delete().in('id', selected)
    }
    setSelected([])
    await fetchAll()
    setDeleting(false)
  }

  function toggleSelect(id: string) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const resultBadge = (result: string) => {
    const cfg: Record<string, { bg: string; color: string; label: string }> = {
      pass:    { bg: '#DCFCE7',  color: C.success, label: lang === 'ar' ? 'ناجح' : 'Pass' },
      fail:    { bg: C.dangerBg, color: C.danger,  label: lang === 'ar' ? 'فاشل' : 'Fail' },
      partial: { bg: '#FEF3C7',  color: C.warning, label: lang === 'ar' ? 'جزئي' : 'Partial' },
    }
    const c = cfg[result?.toLowerCase()] ?? { bg: C.pageBg, color: C.textMid, label: result }
    return <span style={{ background: c.bg, color: c.color, padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 500, fontFamily: F.en }}>{c.label}</span>
  }

  const statusBadge = (status: string) => {
    const cfg: Record<string, { bg: string; color: string; label: string }> = {
      completed:   { bg: '#DCFCE7',  color: C.success, label: t('wo.status.completed') },
      in_progress: { bg: '#FEF3C7',  color: C.warning, label: t('wo.status.in_progress') },
      draft:       { bg: C.pageBg,   color: C.textMid, label: lang === 'ar' ? 'مسودة' : 'Draft' },
    }
    const c = cfg[status?.toLowerCase()] ?? { bg: C.pageBg, color: C.textMid, label: status }
    return <span style={{ background: c.bg, color: c.color, padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 500, fontFamily: F.en }}>{c.label}</span>
  }

  const verticalBadge = (v: string) => {
    const colors: Record<string, string> = { school: '#e3f2fd', retail: '#DCFCE7', compound: '#FEF3C7', hotel: C.dangerBg, general: C.pageBg }
    return <span style={{ background: colors[v] ?? C.pageBg, padding: '2px 10px', borderRadius: 12, fontSize: 12, fontFamily: F.en }}>{v}</span>
  }

  return (
    <div style={{ ...pageStyle, maxWidth: 1100 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: C.navy, fontFamily: F.en, margin: 0 }}>{t('nav.inspections')}</h1>
          <p style={{ fontSize: 13, color: C.textLight, fontFamily: F.en, margin: '4px 0 0' }}>
            {inspections.length} {t('insp.tab.inspections').toLowerCase()} &middot; {templates.length} {t('insp.tab.templates').toLowerCase()}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link href='/dashboard/inspections/templates/new'>
            <button style={secondaryBtn}>+ {t('insp.tab.templates').slice(0, -1)}</button>
          </Link>
          <Link href='/dashboard/inspections/new'>
            <button style={primaryBtn}>+ {lang === 'ar' ? 'بدء تفتيش' : 'Start Inspection'}</button>
          </Link>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 0, marginBottom: '1.5rem', borderBottom: `2px solid ${C.border}` }}>
        {(['inspections', 'templates'] as const).map(tab => (
          <button key={tab} onClick={() => { setActiveTab(tab); setSelected([]) }}
            style={{ padding: '10px 20px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, fontFamily: F.en,
              fontWeight: activeTab === tab ? 600 : 400,
              color: activeTab === tab ? C.navy : C.textLight,
              borderBottom: activeTab === tab ? `2px solid ${C.navy}` : '2px solid transparent',
              marginBottom: -2 }}>
            {tab === 'inspections' ? t('insp.tab.inspections') : t('insp.tab.templates')}
            {tab === 'inspections' && <span style={{ marginLeft: 6, background: C.pageBg, padding: '1px 8px', borderRadius: 12, fontSize: 12 }}>{inspections.length}</span>}
            {tab === 'templates' && <span style={{ marginLeft: 6, background: C.pageBg, padding: '1px 8px', borderRadius: 12, fontSize: 12 }}>{templates.length}</span>}
          </button>
        ))}
      </div>

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
      ) : activeTab === 'inspections' ? (
        inspections.length === 0 ? (
          <p style={{ color: C.textLight, fontFamily: F.en, textAlign: 'center', padding: '3rem' }}>{lang === 'ar' ? 'لا توجد عمليات تفتيش بعد' : 'No inspections yet'}</p>
        ) : (
          <div style={{ ...cardStyle, overflow: 'hidden', padding: 0 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: C.pageBg, borderBottom: `1px solid ${C.border}` }}>
                  <th style={{ padding: '10px 16px', width: 40 }}><input type='checkbox' onChange={e => setSelected(e.target.checked ? inspections.map(i => i.id) : [])} /></th>
                  {[t('insp.col.template'), t('insp.col.vertical'), t('insp.col.site'), t('insp.col.asset'), t('insp.col.by'), t('insp.col.date'), t('insp.col.status'), t('insp.col.result'), t('common.actions')].map(h => (
                    <th key={h} style={tableHeaderCell}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {inspections.map((insp) => (
                  <tr key={insp.id} style={{ background: selected.includes(insp.id) ? '#EEF2FF' : C.white }}>
                    <td style={{ padding: '12px 16px' }}><input type='checkbox' checked={selected.includes(insp.id)} onChange={() => toggleSelect(insp.id)} /></td>
                    <td style={{ ...tableCell, fontWeight: 500, color: C.navy }}>{insp.template?.name ?? '—'}</td>
                    <td style={tableCell}>{verticalBadge(insp.template?.vertical ?? insp.vertical ?? '')}</td>
                    <td style={tableCell}>{insp.site?.name ?? '—'}</td>
                    <td style={tableCell}>{insp.asset?.name ?? '—'}</td>
                    <td style={tableCell}>{insp.inspector?.full_name ?? '—'}</td>
                    <td style={tableCell}>{insp.created_at ? format(new Date(insp.created_at), 'dd MMM yyyy') : '—'}</td>
                    <td style={tableCell}>{statusBadge(insp.status)}</td>
                    <td style={tableCell}>{resultBadge(insp.overall_result)}</td>
                    <td style={tableCell}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <Link href={'/dashboard/inspections/' + insp.id}>
                          <button style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.white, cursor: 'pointer', fontSize: 11, fontFamily: F.en }}>{t('common.view')}</button>
                        </Link>
                        <button onClick={() => deleteInspection(insp.id)} style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${C.dangerBorder}`, background: C.dangerBg, color: C.danger, cursor: 'pointer', fontSize: 11, fontFamily: F.en }}>{t('common.delete')}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        templates.length === 0 ? (
          <p style={{ color: C.textLight, fontFamily: F.en, textAlign: 'center', padding: '3rem' }}>{lang === 'ar' ? 'لا توجد نماذج بعد' : 'No templates yet'}</p>
        ) : (
          <div style={{ ...cardStyle, overflow: 'hidden', padding: 0 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: C.pageBg, borderBottom: `1px solid ${C.border}` }}>
                  <th style={{ padding: '10px 16px', width: 40 }}><input type='checkbox' onChange={e => setSelected(e.target.checked ? templates.map(tmpl => tmpl.id) : [])} /></th>
                  {[t('common.name'), t('insp.col.vertical'), lang === 'ar' ? 'عدد العناصر' : 'Items', t('common.actions')].map(h => (
                    <th key={h} style={tableHeaderCell}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {templates.map((tmpl) => (
                  <tr key={tmpl.id} style={{ background: selected.includes(tmpl.id) ? '#EEF2FF' : C.white }}>
                    <td style={{ padding: '12px 16px' }}><input type='checkbox' checked={selected.includes(tmpl.id)} onChange={() => toggleSelect(tmpl.id)} /></td>
                    <td style={{ ...tableCell, fontWeight: 500, color: C.navy }}>{tmpl.name}</td>
                    <td style={tableCell}>{verticalBadge(tmpl.vertical ?? 'general')}</td>
                    <td style={tableCell}>{tmpl.items?.length ?? 0}</td>
                    <td style={tableCell}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <Link href={'/dashboard/inspections/templates/' + tmpl.id + '/edit'}>
                          <button style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.white, cursor: 'pointer', fontSize: 11, fontFamily: F.en }}>{t('common.edit')}</button>
                        </Link>
                        <button onClick={() => deleteTemplate(tmpl.id)} style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${C.dangerBorder}`, background: C.dangerBg, color: C.danger, cursor: 'pointer', fontSize: 11, fontFamily: F.en }}>{t('common.delete')}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  )
}
