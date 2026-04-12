'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { format } from 'date-fns'
import Link from 'next/link'

export default function InspectionsPage() {
  const [inspections, setInspections] = useState<any[]>([])
  const [templates, setTemplates] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'inspections' | 'templates'>('inspections')
  const [selected, setSelected] = useState<string[]>([])
  const [deleting, setDeleting] = useState(false)
  const supabase = createClient()

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
    if (!profile) return
    const orgId = profile.organisation_id
    const [{ data: insp }, { data: tmpl }] = await Promise.all([
      supabase.from('inspection_results').select('*, template:template_id(name, vertical), conductor:conducted_by(full_name), site:site_id(name), asset:asset_id(name)').eq('organisation_id', orgId).order('created_at', { ascending: false }),
      supabase.from('inspection_templates').select('*').eq('organisation_id', orgId).order('created_at', { ascending: false }),
    ])
    if (insp) setInspections(insp)
    if (tmpl) setTemplates(tmpl)
    setLoading(false)
  }

  async function deleteSelected() {
    if (!confirm('Delete ' + selected.length + ' inspection(s)? This cannot be undone.')) return
    setDeleting(true)
    await supabase.from('inspection_results').delete().in('id', selected)
    setSelected([])
    await fetchAll()
    setDeleting(false)
  }

  async function deleteTemplate(id: string) {
    if (!confirm('Delete this template? Existing inspections using it will not be affected.')) return
    await supabase.from('inspection_templates').delete().eq('id', id)
    fetchAll()
  }

  function toggleSelect(id: string) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function toggleSelectAll() {
    setSelected(prev => prev.length === inspections.length ? [] : inspections.map(i => i.id))
  }

  const resultConfig: Record<string, { bg: string; color: string; label: string }> = {
    pass:    { bg: '#e8f5e9', color: '#2e7d32', label: 'Pass' },
    fail:    { bg: '#fce4ec', color: '#b71c1c', label: 'Fail' },
    partial: { bg: '#fff8e1', color: '#f57f17', label: 'Partial' },
  }

  const statusConfig: Record<string, { bg: string; color: string }> = {
    in_progress: { bg: '#fff8e1', color: '#f57f17' },
    completed:   { bg: '#e8f5e9', color: '#2e7d32' },
    failed:      { bg: '#fce4ec', color: '#b71c1c' },
  }

  const verticalColors: Record<string, string> = {
    school: '#e3f2fd', retail: '#e8f5e9', compound: '#fff8e1', hotel: '#fce4ec', general: '#f3e5f5',
  }

  const tabStyle = (active: boolean) => ({
    padding: '8px 20px', border: 'none',
    borderBottom: active ? '2px solid #1a1a2e' : '2px solid transparent',
    background: 'transparent', cursor: 'pointer',
    fontSize: 14, fontWeight: (active ? 600 : 400) as any,
    color: active ? '#1a1a2e' : '#999',
  })

  return (
    <div style={{ padding: '2rem', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>Inspections</h1>
          <p style={{ fontSize: 13, color: '#999', margin: '4px 0 0' }}>{inspections.length} inspections · {templates.length} templates</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href='/dashboard/inspections/templates/new'>
            <button style={{ background: 'white', color: '#1a1a2e', padding: '8px 16px', borderRadius: 8, border: '1px solid #1a1a2e', cursor: 'pointer', fontWeight: 500, fontSize: 13 }}>+ New Template</button>
          </Link>
          <Link href='/dashboard/inspections/new'>
            <button style={{ background: '#1a1a2e', color: 'white', padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 500 }}>+ Start Inspection</button>
          </Link>
        </div>
      </div>

      <div style={{ borderBottom: '1px solid #eee', marginBottom: '1.5rem', display: 'flex' }}>
        <button style={tabStyle(activeTab === 'inspections')} onClick={() => { setActiveTab('inspections'); setSelected([]) }}>Inspections ({inspections.length})</button>
        <button style={tabStyle(activeTab === 'templates')} onClick={() => { setActiveTab('templates'); setSelected([]) }}>Templates ({templates.length})</button>
      </div>

      {loading ? <p style={{ color: '#999' }}>Loading...</p> : activeTab === 'inspections' ? (
        <div>
          {selected.length > 0 && (
            <div style={{ background: '#fce4ec', border: '1px solid #ef9a9a', borderRadius: 10, padding: '10px 16px', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: '#b71c1c' }}>{selected.length} inspection(s) selected</span>
              <button onClick={deleteSelected} disabled={deleting} style={{ padding: '6px 16px', borderRadius: 7, border: 'none', background: '#c62828', color: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>
                {deleting ? 'Deleting...' : 'Delete Selected'}
              </button>
              <button onClick={() => setSelected([])} style={{ padding: '6px 12px', borderRadius: 7, border: '1px solid #ef9a9a', background: 'white', cursor: 'pointer', fontSize: 12, color: '#666' }}>Cancel</button>
            </div>
          )}

          {inspections.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '4rem', color: '#999' }}>
              <p style={{ fontSize: 18, marginBottom: 8 }}>No inspections yet</p>
              <p style={{ fontSize: 14 }}>Start your first inspection using a template</p>
            </div>
          ) : (
            <div style={{ border: '1px solid #eee', borderRadius: 12, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f9f9f9', borderBottom: '1px solid #eee' }}>
                    <th style={{ padding: '12px 16px', width: 40 }}>
                      <input type='checkbox' checked={selected.length === inspections.length && inspections.length > 0} onChange={toggleSelectAll} />
                    </th>
                    {['Template','Vertical','Site','Asset','Conducted By','Result','Status','Date','Actions'].map(h => (
                      <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 500, color: '#666' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {inspections.map((insp, i) => {
                    const rCfg = insp.overall_result ? resultConfig[insp.overall_result] : null
                    const sCfg = statusConfig[insp.status] ?? statusConfig.in_progress
                    const isSelected = selected.includes(insp.id)
                    return (
                      <tr key={insp.id} style={{ borderBottom: '1px solid #f0f0f0', background: isSelected ? '#fff3f3' : i % 2 === 0 ? 'white' : '#fafafa' }}>
                        <td style={{ padding: '12px 16px' }}>
                          <input type='checkbox' checked={isSelected} onChange={() => toggleSelect(insp.id)} />
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <Link href={'/dashboard/inspections/' + insp.id} style={{ color: '#1a1a2e', fontWeight: 500, textDecoration: 'none', fontSize: 14 }}>
                            {insp.template?.name ?? 'Unknown'}
                          </Link>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          {insp.template?.vertical && (
                            <span style={{ background: verticalColors[insp.template.vertical] ?? '#f5f5f5', color: '#333', padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 500 }}>
                              {insp.template.vertical.charAt(0).toUpperCase() + insp.template.vertical.slice(1)}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: 13, color: '#666' }}>{insp.site?.name ?? '—'}</td>
                        <td style={{ padding: '12px 16px', fontSize: 13, color: '#666' }}>{insp.asset?.name ?? '—'}</td>
                        <td style={{ padding: '12px 16px', fontSize: 13, color: '#666' }}>{insp.conductor?.full_name ?? '—'}</td>
                        <td style={{ padding: '12px 16px' }}>
                          {rCfg ? <span style={{ background: rCfg.bg, color: rCfg.color, padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 500 }}>{rCfg.label}</span> : '—'}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{ background: sCfg.bg, color: sCfg.color, padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 500 }}>
                            {insp.status.replace('_', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: 13, color: '#666' }}>{format(new Date(insp.created_at), 'dd MMM yyyy')}</td>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <Link href={'/dashboard/inspections/' + insp.id}>
                              <button style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #ddd', background: 'white', cursor: 'pointer', fontSize: 11 }}>View</button>
                            </Link>
                            <button
                              onClick={async () => {
                                if (!confirm('Delete this inspection?')) return
                                await supabase.from('inspection_results').delete().eq('id', insp.id)
                                fetchAll()
                              }}
                              style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #ef9a9a', background: '#fce4ec', color: '#c62828', cursor: 'pointer', fontSize: 11 }}
                            >
                              Delete
                            </button>
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
      ) : (
        <div>
          {templates.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '4rem', color: '#999' }}>
              <p style={{ fontSize: 18, marginBottom: 8 }}>No templates yet</p>
              <p style={{ fontSize: 14 }}>Create a template to start running inspections</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
              {templates.map(t => (
                <div key={t.id} style={{ background: 'white', border: '1px solid #eee', borderRadius: 12, padding: '1.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <p style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>{t.name}</p>
                    {t.vertical && (
                      <span style={{ background: verticalColors[t.vertical] ?? '#f5f5f5', color: '#333', padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 500 }}>
                        {t.vertical.charAt(0).toUpperCase() + t.vertical.slice(1)}
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: 13, color: '#999', margin: '0 0 6px' }}>{(t.items ?? []).length} checklist items</p>
                  {t.is_default && <span style={{ fontSize: 11, background: '#e8eaf6', color: '#283593', padding: '2px 8px', borderRadius: 6 }}>Default template</span>}
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <Link href={'/dashboard/inspections/new?template=' + t.id} style={{ flex: 1 }}>
                      <button style={{ width: '100%', padding: '7px', borderRadius: 7, border: 'none', background: '#1a1a2e', color: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>Use Template</button>
                    </Link>
                    <Link href={'/dashboard/inspections/templates/' + t.id + '/edit'}>
                      <button style={{ padding: '7px 12px', borderRadius: 7, border: '1px solid #ddd', background: 'white', cursor: 'pointer', fontSize: 12 }}>Edit</button>
                    </Link>
                    <button
                      onClick={() => deleteTemplate(t.id)}
                      style={{ padding: '7px 12px', borderRadius: 7, border: '1px solid #ef9a9a', background: '#fce4ec', color: '#c62828', cursor: 'pointer', fontSize: 12 }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}