'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { format } from 'date-fns'
import Link from 'next/link'
import { useLanguage } from '@/context/LanguageContext'

export default function InspectionsPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [inspections, setInspections] = useState<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [templates, setTemplates] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'inspections' | 'templates'>('inspections')
  const [selected, setSelected] = useState<string[]>([])
  const [deleting, setDeleting] = useState(false)
  const supabase = createClient()
  const { t, lang } = useLanguage()

  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    const cfg: Record<string, { className: string; label: string }> = {
      pass:    { className: 'bg-primary/10 text-primary',          label: lang === 'ar' ? 'ناجح' : 'Pass' },
      fail:    { className: 'bg-error/10 text-error',              label: lang === 'ar' ? 'فاشل' : 'Fail' },
      partial: { className: 'bg-[#f57f17]/10 text-[#f57f17]',     label: lang === 'ar' ? 'جزئي' : 'Partial' },
    }
    const c = cfg[result?.toLowerCase()] ?? { className: 'bg-surface-container-low text-on-surface-variant', label: result }
    return <span className={`${c.className} px-2.5 py-0.5 rounded-full text-xs font-medium`}>{c.label}</span>
  }

  const statusBadge = (status: string) => {
    const cfg: Record<string, { className: string; label: string }> = {
      completed:   { className: 'bg-primary/10 text-primary',      label: t('wo.status.completed') },
      in_progress: { className: 'bg-[#f57f17]/10 text-[#f57f17]', label: t('wo.status.in_progress') },
      draft:       { className: 'bg-surface-container-low text-on-surface-variant', label: lang === 'ar' ? 'مسودة' : 'Draft' },
    }
    const c = cfg[status?.toLowerCase()] ?? { className: 'bg-surface-container-low text-on-surface-variant', label: status }
    return <span className={`${c.className} px-2.5 py-0.5 rounded-full text-xs font-medium`}>{c.label}</span>
  }

  const verticalBadge = (v: string) => {
    const colors: Record<string, string> = {
      school:   'bg-blue-50 text-blue-700',
      retail:   'bg-primary/10 text-primary',
      compound: 'bg-[#f57f17]/10 text-[#f57f17]',
      hotel:    'bg-error/10 text-error',
      general:  'bg-surface-container-low text-on-surface-variant',
    }
    const cls = colors[v] ?? 'bg-surface-container-low text-on-surface-variant'
    return <span className={`${cls} px-2.5 py-0.5 rounded-full text-xs`}>{v}</span>
  }

  return (
    <div className="star-pattern bg-surface min-h-screen p-8">
      <div className="max-w-[1440px] mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-on-surface m-0">{t('nav.inspections')}</h1>
            <p className="text-sm text-on-surface-variant mt-1 mb-0">
              {inspections.length} {t('insp.tab.inspections').toLowerCase()} &middot; {templates.length} {t('insp.tab.templates').toLowerCase()}
            </p>
          </div>
          <div className="flex gap-2.5">
            <Link href='/dashboard/inspections/templates/new'>
              <button className="border border-outline-variant text-on-surface-variant px-4 py-2 rounded-xl text-sm font-semibold hover:bg-surface-container-low transition-colors">+ {t('insp.tab.templates').slice(0, -1)}</button>
            </Link>
            <Link href='/dashboard/inspections/new'>
              <button className="bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20">+ {lang === 'ar' ? 'بدء تفتيش' : 'Start Inspection'}</button>
            </Link>
          </div>
        </div>

        <div className="flex border-b-2 border-outline-variant">
          {(['inspections', 'templates'] as const).map(tab => (
            <button key={tab} onClick={() => { setActiveTab(tab); setSelected([]) }}
              className={`px-5 py-2.5 border-0 bg-transparent cursor-pointer text-sm -mb-0.5 ${activeTab === tab ? 'font-semibold text-primary border-b-2 border-primary' : 'font-normal text-on-surface-variant border-b-2 border-transparent'}`}>
              {tab === 'inspections' ? t('insp.tab.inspections') : t('insp.tab.templates')}
              {tab === 'inspections' && <span className="ml-1.5 bg-surface-container-low px-2 py-0.5 rounded-full text-xs">{inspections.length}</span>}
              {tab === 'templates' && <span className="ml-1.5 bg-surface-container-low px-2 py-0.5 rounded-full text-xs">{templates.length}</span>}
            </button>
          ))}
        </div>

        {selected.length > 0 && (
          <div className="bg-error/10 border border-error/20 rounded-xl px-4 py-2.5 flex items-center gap-3">
            <span className="text-sm font-medium text-error">{selected.length} {t('common.selected')}</span>
            <button onClick={deleteSelected} disabled={deleting} className="bg-error text-white px-4 py-1.5 rounded-lg text-xs font-semibold hover:bg-error/90 transition-colors disabled:opacity-50">
              {deleting ? t('common.loading') : t('btn.delete_selected')}
            </button>
            <button onClick={() => setSelected([])} className="px-3 py-1.5 rounded-lg border border-error/20 bg-surface-container-lowest cursor-pointer text-xs text-on-surface-variant">{t('common.cancel')}</button>
          </div>
        )}

        {loading ? (
          <p className="text-on-surface-variant">{t('common.loading')}</p>
        ) : activeTab === 'inspections' ? (
          inspections.length === 0 ? (
            <p className="text-on-surface-variant text-center py-12">{lang === 'ar' ? 'لا توجد عمليات تفتيش بعد' : 'No inspections yet'}</p>
          ) : (
            <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm overflow-hidden">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-surface-container-low border-b border-outline-variant">
                    <th className="px-4 py-4 w-10"><input type='checkbox' onChange={e => setSelected(e.target.checked ? inspections.map(i => i.id) : [])} /></th>
                    {[t('insp.col.template'), t('insp.col.vertical'), t('insp.col.site'), t('insp.col.asset'), t('insp.col.by'), t('insp.col.date'), t('insp.col.status'), t('insp.col.result'), t('common.actions')].map(h => (
                      <th key={h} className="px-4 py-4 text-xs font-semibold uppercase tracking-wider text-on-surface-variant text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {inspections.map((insp) => (
                    <tr key={insp.id} className={`${selected.includes(insp.id) ? 'bg-primary/5' : 'bg-surface-container-lowest'} hover:bg-surface-container-low transition-colors`}>
                      <td className="px-4 py-3"><input type='checkbox' checked={selected.includes(insp.id)} onChange={() => toggleSelect(insp.id)} /></td>
                      <td className="px-4 py-3 text-sm font-medium text-primary">{insp.template?.name ?? '—'}</td>
                      <td className="px-4 py-3 text-sm text-on-surface-variant">{verticalBadge(insp.template?.vertical ?? insp.vertical ?? '')}</td>
                      <td className="px-4 py-3 text-sm text-on-surface-variant">{insp.site?.name ?? '—'}</td>
                      <td className="px-4 py-3 text-sm text-on-surface-variant">{insp.asset?.name ?? '—'}</td>
                      <td className="px-4 py-3 text-sm text-on-surface-variant">{insp.inspector?.full_name ?? '—'}</td>
                      <td className="px-4 py-3 text-sm text-on-surface-variant">{insp.created_at ? format(new Date(insp.created_at), 'dd MMM yyyy') : '—'}</td>
                      <td className="px-4 py-3 text-sm text-on-surface-variant">{statusBadge(insp.status)}</td>
                      <td className="px-4 py-3 text-sm text-on-surface-variant">{resultBadge(insp.overall_result)}</td>
                      <td className="px-4 py-3 text-sm text-on-surface-variant">
                        <div className="flex gap-1.5">
                          <Link href={'/dashboard/inspections/' + insp.id}>
                            <button className="px-2.5 py-1 rounded-lg border border-outline-variant bg-surface-container-lowest cursor-pointer text-[11px] hover:bg-surface-container-low transition-colors">{t('common.view')}</button>
                          </Link>
                          <button onClick={() => deleteInspection(insp.id)} className="px-2.5 py-1 rounded-lg border border-error/20 bg-error/10 text-error cursor-pointer text-[11px] hover:bg-error/20 transition-colors">{t('common.delete')}</button>
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
            <p className="text-on-surface-variant text-center py-12">{lang === 'ar' ? 'لا توجد نماذج بعد' : 'No templates yet'}</p>
          ) : (
            <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm overflow-hidden">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-surface-container-low border-b border-outline-variant">
                    <th className="px-4 py-4 w-10"><input type='checkbox' onChange={e => setSelected(e.target.checked ? templates.map(tmpl => tmpl.id) : [])} /></th>
                    {[t('common.name'), t('insp.col.vertical'), lang === 'ar' ? 'عدد العناصر' : 'Items', t('common.actions')].map(h => (
                      <th key={h} className="px-4 py-4 text-xs font-semibold uppercase tracking-wider text-on-surface-variant text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {templates.map((tmpl) => (
                    <tr key={tmpl.id} className={`${selected.includes(tmpl.id) ? 'bg-primary/5' : 'bg-surface-container-lowest'} hover:bg-surface-container-low transition-colors`}>
                      <td className="px-4 py-3"><input type='checkbox' checked={selected.includes(tmpl.id)} onChange={() => toggleSelect(tmpl.id)} /></td>
                      <td className="px-4 py-3 text-sm font-medium text-primary">{tmpl.name}</td>
                      <td className="px-4 py-3 text-sm text-on-surface-variant">{verticalBadge(tmpl.vertical ?? 'general')}</td>
                      <td className="px-4 py-3 text-sm text-on-surface-variant">{tmpl.items?.length ?? 0}</td>
                      <td className="px-4 py-3 text-sm text-on-surface-variant">
                        <div className="flex gap-1.5">
                          <Link href={'/dashboard/inspections/templates/' + tmpl.id + '/edit'}>
                            <button className="px-2.5 py-1 rounded-lg border border-outline-variant bg-surface-container-lowest cursor-pointer text-[11px] hover:bg-surface-container-low transition-colors">{t('common.edit')}</button>
                          </Link>
                          <button onClick={() => deleteTemplate(tmpl.id)} className="px-2.5 py-1 rounded-lg border border-error/20 bg-error/10 text-error cursor-pointer text-[11px] hover:bg-error/20 transition-colors">{t('common.delete')}</button>
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
    </div>
  )
}
