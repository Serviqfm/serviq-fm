content = """'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { format } from 'date-fns'
import Link from 'next/link'
import { useLanguage } from '@/context/LanguageContext'

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
      pass:    { bg: '#e8f5e9', color: '#2e7d32', label: lang === 'ar' ? 'ناجح' : 'Pass' },
      fail:    { bg: '#fce4ec', color: '#c62828', label: lang === 'ar' ? 'فاشل' : 'Fail' },
      partial: { bg: '#fff8e1', color: '#f57f17', label: lang === 'ar' ? 'جزئي' : 'Partial' },
    }
    const c = cfg[result?.toLowerCase()] ?? { bg: '#f5f5f5', color: '#666', label: result }
    return <span style={{ background: c.bg, color: c.color, padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 500 }}>{c.label}</span>
  }

  const statusBadge = (status: string) => {
    const cfg: Record<string, { bg: string; color: string; label: string }> = {
      completed:   { bg: '#e8f5e9', color: '#2e7d32', label: t('wo.status.completed') },
      in_progress: { bg: '#fff8e1', color: '#f57f17', label: t('wo.status.in_progress') },
      draft:       { bg: '#f5f5f5', color: '#666', label: lang === 'ar' ? 'مسودة' : 'Draft' },
    }
    const c = cfg[status?.toLowerCase()] ?? { bg: '#f5f5f5', color: '#666', label: status }
    return <span style={{ background: c.bg, color: c.color, padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 500 }}>{c.label}</span>
  }

  const verticalBadge = (v: string) => {
    const colors: Record<string, string> = { school: '#e3f2fd', retail: '#e8f5e9', compound: '#fff8e1', hotel: '#fce4ec', general: '#f3f4fd' }
    return <span style={{ background: colors[v] ?? '#f3f4fd', padding: '2px 10px', borderRadius: 12, fontSize: 12 }}>{v}</span>
  }

  const thStyle = { padding: '12px 16px', textAlign: 'left' as const, fontSize: 12, fontWeight: 500, color: '#666' }
  const tdStyle = { padding: '12px 16px', fontSize: 13, color: '#666' }

  return (
    <div style={{ padding: '2rem', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>{t('nav.inspections')}</h1>
          <p style={{ fontSize: 13, color: '#999', margin: '4px 0 0' }}>
            {inspections.length} {t('insp.tab.inspections').toLowerCase()} &middot; {templates.length} {t('insp.tab.templates').toLowerCase()}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link href='/dashboard/inspections/templates/new'>
            <button style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #ddd', background: 'white', cursor: 'pointer', fontSize: 13 }}>
              + {t('insp.tab.templates').slice(0, -1)}
            </button>
          </Link>
          <Link href='/dashboard/inspections/new'>
            <button style={{ background: '#1a1a2e', color: 'white', padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 500 }}>
              + {lang === 'ar' ? 'بدء تفتيش' : 'Start Inspection'}
            </button>
          </Link>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 0, marginBottom: '1.5rem', borderBottom: '2px solid #eee' }}>
        {(['inspections', 'templates'] as const).map(tab => (
          <button key={tab} onClick={() => { setActiveTab(tab); setSelected([]) }}
            style={{ padding: '10px 20px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, fontWeight: activeTab === tab ? 600 : 400, color: activeTab === tab ? '#1a1a2e' : '#666', borderBottom: activeTab === tab ? '2px solid #1a1a2e' : '2px solid transparent', marginBottom: -2 }}>
            {tab === 'inspections' ? t('insp.tab.inspections') : t('insp.tab.templates')}
            {tab === 'inspections' && <span style={{ marginLeft: 6, background: '#f3f4fd', padding: '1px 8px', borderRadius: 12, fontSize: 12 }}>{inspections.length}</span>}
            {tab === 'templates' && <span style={{ marginLeft: 6, background: '#f3f4fd', padding: '1px 8px', borderRadius: 12, fontSize: 12 }}>{templates.length}</span>}
          </button>
        ))}
      </div>

      {selected.length > 0 && (
        <div style={{ background: '#fce4ec', border: '1px solid #ef9a9a', borderRadius: 10, padding: '10px 16px', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: '#b71c1c' }}>{selected.length} {t('common.selected')}</span>
          <button onClick={deleteSelected} disabled={deleting} style={{ padding: '6px 16px', borderRadius: 7, border: 'none', background: '#c62828', color: 'white', cursor: 'pointer', fontSize: 12 }}>
            {deleting ? t('common.loading') : t('btn.delete_selected')}
          </button>
          <button onClick={() => setSelected([])} style={{ padding: '6px 12px', borderRadius: 7, border: '1px solid #ef9a9a', background: 'white', cursor: 'pointer', fontSize: 12 }}>{t('common.cancel')}</button>
        </div>
      )}

      {loading ? <p style={{ color: '#999' }}>{t('common.loading')}</p> : activeTab === 'inspections' ? (
        inspections.length === 0 ? (
          <p style={{ color: '#999', textAlign: 'center', padding: '3rem' }}>{lang === 'ar' ? 'لا توجد عمليات تفتيش بعد' : 'No inspections yet'}</p>
        ) : (
          <div style={{ border: '1px solid #eee', borderRadius: 12, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f9f9f9', borderBottom: '1px solid #eee' }}>
                  <th style={{ padding: '12px 16px', width: 40 }}><input type='checkbox' onChange={e => setSelected(e.target.checked ? inspections.map(i => i.id) : [])} /></th>
                  {[t('insp.col.template'), t('insp.col.vertical'), t('insp.col.site'), t('insp.col.asset'), t('insp.col.by'), t('insp.col.date'), t('insp.col.status'), t('insp.col.result'), t('common.actions')].map(h => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {inspections.map((insp, i) => (
                  <tr key={insp.id} style={{ borderBottom: '1px solid #f0f0f0', background: selected.includes(insp.id) ? '#f3f4fd' : i % 2 === 0 ? 'white' : '#fafafa' }}>
                    <td style={tdStyle}><input type='checkbox' checked={selected.includes(insp.id)} onChange={() => toggleSelect(insp.id)} /></td>
                    <td style={{ ...tdStyle, fontWeight: 500, color: '#1a1a2e' }}>{insp.template?.name ?? '\u2014'}</td>
                    <td style={tdStyle}>{verticalBadge(insp.template?.vertical ?? insp.vertical ?? '')}</td>
                    <td style={tdStyle}>{insp.site?.name ?? '\u2014'}</td>
                    <td style={tdStyle}>{insp.asset?.name ?? '\u2014'}</td>
                    <td style={tdStyle}>{insp.inspector?.full_name ?? '\u2014'}</td>
                    <td style={tdStyle}>{insp.created_at ? format(new Date(insp.created_at), 'dd MMM yyyy') : '\u2014'}</td>
                    <td style={tdStyle}>{statusBadge(insp.status)}</td>
                    <td style={tdStyle}>{resultBadge(insp.overall_result)}</td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <Link href={'/dashboard/inspections/' + insp.id}>
                          <button style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #ddd', background: 'white', cursor: 'pointer', fontSize: 11 }}>{t('common.view')}</button>
                        </Link>
                        <button onClick={() => deleteInspection(insp.id)} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #ef9a9a', background: '#fce4ec', color: '#c62828', cursor: 'pointer', fontSize: 11 }}>{t('common.delete')}</button>
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
          <p style={{ color: '#999', textAlign: 'center', padding: '3rem' }}>{lang === 'ar' ? 'لا توجد نماذج بعد' : 'No templates yet'}</p>
        ) : (
          <div style={{ border: '1px solid #eee', borderRadius: 12, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f9f9f9', borderBottom: '1px solid #eee' }}>
                  <th style={{ padding: '12px 16px', width: 40 }}><input type='checkbox' onChange={e => setSelected(e.target.checked ? templates.map(t => t.id) : [])} /></th>
                  {[t('common.name'), t('insp.col.vertical'), lang === 'ar' ? 'عدد العناصر' : 'Items', t('common.actions')].map(h => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {templates.map((tmpl, i) => (
                  <tr key={tmpl.id} style={{ borderBottom: '1px solid #f0f0f0', background: selected.includes(tmpl.id) ? '#f3f4fd' : i % 2 === 0 ? 'white' : '#fafafa' }}>
                    <td style={tdStyle}><input type='checkbox' checked={selected.includes(tmpl.id)} onChange={() => toggleSelect(tmpl.id)} /></td>
                    <td style={{ ...tdStyle, fontWeight: 500, color: '#1a1a2e' }}>{tmpl.name}</td>
                    <td style={tdStyle}>{verticalBadge(tmpl.vertical ?? 'general')}</td>
                    <td style={tdStyle}>{tmpl.items?.length ?? 0}</td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <Link href={'/dashboard/inspections/templates/' + tmpl.id + '/edit'}>
                          <button style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #ddd', background: 'white', cursor: 'pointer', fontSize: 11 }}>{t('common.edit')}</button>
                        </Link>
                        <button onClick={() => deleteTemplate(tmpl.id)} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #ef9a9a', background: '#fce4ec', color: '#c62828', cursor: 'pointer', fontSize: 11 }}>{t('common.delete')}</button>
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
}"""

with open('src/app/dashboard/inspections/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Inspections page completely rewritten')