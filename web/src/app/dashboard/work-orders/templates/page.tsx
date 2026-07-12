'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useLanguage } from '@/context/LanguageContext'
import { WorkOrderTemplate } from '@/types/work-order'

const inputCls = 'w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-on-surface-variant/40'
const labelCls = 'block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5'

// Values must match the new-WO form's <option> strings exactly, or a templated
// category won't select on prefill (WO list filters on these too).
const CATEGORIES = ['HVAC', 'Electrical', 'Plumbing', 'Elevator / Lift', 'Fire Safety', 'Furniture', 'Kitchen Equipment', 'Pool / Gym', 'IT Equipment', 'Signage', 'Vehicle', 'Other']
const PRIORITIES = ['low', 'medium', 'high', 'critical']

interface EditorState {
  id: string | null
  name: string
  name_ar: string
  title: string
  description: string
  priority: string
  category: string
  asset_id: string
  assigned_to: string
  estimated_duration: string
  items: { title: string; title_ar: string }[]
}

const emptyEditor: EditorState = {
  id: null, name: '', name_ar: '', title: '', description: '', priority: 'medium',
  category: '', asset_id: '', assigned_to: '', estimated_duration: '', items: [{ title: '', title_ar: '' }],
}

export default function WorkOrderTemplatesPage() {
  const supabase = createClient()
  const { lang } = useLanguage()
  const [templates, setTemplates] = useState<WorkOrderTemplate[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [assets, setAssets] = useState<any[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [technicians, setTechnicians] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [orgId, setOrgId] = useState('')
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
    if (!profile) { setLoading(false); return }
    setOrgId(profile.organisation_id)
    const [{ data }, { data: assetData }, { data: techData }] = await Promise.all([
      supabase.from('work_order_templates').select('*').eq('organisation_id', profile.organisation_id).order('name'),
      supabase.from('assets').select('id, name').eq('organisation_id', profile.organisation_id).eq('status', 'active'),
      supabase.from('users').select('id, full_name').eq('organisation_id', profile.organisation_id).in('role', ['technician', 'manager']),
    ])
    if (data) setTemplates(data as WorkOrderTemplate[])
    if (assetData) setAssets(assetData)
    if (techData) setTechnicians(techData)
    setLoading(false)
  }

  function startCreate() { setError(''); setEditor({ ...emptyEditor, items: [{ title: '', title_ar: '' }] }) }

  function startEdit(tpl: WorkOrderTemplate) {
    setError('')
    setEditor({
      id: tpl.id,
      name: tpl.name,
      name_ar: tpl.name_ar ?? '',
      title: tpl.title ?? '',
      description: tpl.description ?? '',
      priority: tpl.priority ?? 'medium',
      category: tpl.category ?? '',
      asset_id: tpl.asset_id ?? '',
      assigned_to: tpl.assigned_to ?? '',
      estimated_duration: tpl.estimated_duration_minutes ? String(tpl.estimated_duration_minutes) : '',
      items: (Array.isArray(tpl.tasks) ? tpl.tasks : []).map(it => ({ title: it.title ?? '', title_ar: it.title_ar ?? '' })),
    })
  }

  function patch(field: keyof EditorState, value: string) {
    setEditor(prev => prev ? { ...prev, [field]: value } : prev)
  }
  function updateItem(i: number, field: 'title' | 'title_ar', value: string) {
    setEditor(prev => prev ? { ...prev, items: prev.items.map((it, idx) => idx === i ? { ...it, [field]: value } : it) } : prev)
  }
  function addItem() { setEditor(prev => prev ? { ...prev, items: [...prev.items, { title: '', title_ar: '' }] } : prev) }
  function removeItem(i: number) { setEditor(prev => prev ? { ...prev, items: prev.items.filter((_, idx) => idx !== i) } : prev) }

  async function save() {
    if (!editor) return
    setError('')
    if (!editor.name.trim()) { setError(lang === 'ar' ? 'اسم القالب مطلوب' : 'Template name is required'); return }
    const tasks = editor.items
      .filter(it => it.title.trim() || it.title_ar.trim())
      .map(it => ({ title: it.title.trim() || it.title_ar.trim(), ...(it.title_ar.trim() ? { title_ar: it.title_ar.trim() } : {}) }))
    const dur = parseInt(editor.estimated_duration)
    setSaving(true)
    const row = {
      name: editor.name.trim(),
      name_ar: editor.name_ar.trim() || null,
      title: editor.title.trim() || null,
      description: editor.description.trim() || null,
      priority: editor.priority || null,
      category: editor.category || null,
      asset_id: editor.asset_id || null,
      assigned_to: editor.assigned_to || null,
      estimated_duration_minutes: Number.isFinite(dur) && dur > 0 ? dur : null,
      tasks,
    }
    const { error: err } = editor.id
      ? await supabase.from('work_order_templates').update(row).eq('id', editor.id)
      : await supabase.from('work_order_templates').insert({ ...row, organisation_id: orgId })
    setSaving(false)
    if (err) { setError(err.message || (lang === 'ar' ? 'فشل الحفظ' : 'Failed to save')); return }
    setEditor(null)
    await load()
  }

  async function remove(tpl: WorkOrderTemplate) {
    if (!confirm(lang === 'ar' ? `حذف القالب "${tpl.name_ar ?? tpl.name}"؟` : `Delete template "${tpl.name}"?`)) return
    await supabase.from('work_order_templates').delete().eq('id', tpl.id)
    await load()
  }

  return (
    <div className="star-pattern bg-surface min-h-screen p-8">
      <div className="max-w-[900px] mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <a href="/dashboard/work-orders" className="text-on-surface-variant text-sm hover:text-primary transition-colors">
              {lang === 'ar' ? 'العودة إلى أوامر العمل' : 'Back to Work Orders'}
            </a>
            <h1 className="text-2xl font-bold text-on-surface mt-2">
              {lang === 'ar' ? 'قوالب أوامر العمل' : 'Work Order Templates'}
            </h1>
            <p className="text-on-surface-variant mt-1 text-sm">
              {lang === 'ar'
                ? 'قوالب جاهزة لأوامر العمل المتكررة — ابدأ منها عند إنشاء أمر عمل جديد.'
                : 'Presets for recurring work — start a new work order from one, then edit.'}
            </p>
          </div>
          {!editor && (
            <button onClick={startCreate}
              className="bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm flex items-center gap-2 hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20">
              <span className="material-symbols-outlined text-lg">add</span>
              {lang === 'ar' ? 'قالب جديد' : 'New Template'}
            </button>
          )}
        </div>

        {editor && (
          <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-6 space-y-5">
            <p className="text-[15px] font-semibold text-primary m-0">
              {editor.id ? (lang === 'ar' ? 'تعديل القالب' : 'Edit Template') : (lang === 'ar' ? 'قالب جديد' : 'New Template')}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>{lang === 'ar' ? 'اسم القالب (إنجليزي)' : 'Template Name (English)'} <span className="text-error">*</span></label>
                <input value={editor.name} onChange={e => patch('name', e.target.value)} placeholder="e.g. Monthly HVAC Service" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>{lang === 'ar' ? 'اسم القالب (عربي)' : 'Template Name (Arabic)'}</label>
                <input value={editor.name_ar} onChange={e => patch('name_ar', e.target.value)} dir="rtl" className={inputCls} />
              </div>
            </div>

            <div className="border-t border-outline-variant/30 pt-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant mb-3">{lang === 'ar' ? 'القيم الافتراضية لأمر العمل' : 'Work Order Defaults'}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className={labelCls}>{lang === 'ar' ? 'العنوان' : 'Title'}</label>
                  <input value={editor.title} onChange={e => patch('title', e.target.value)} className={inputCls} />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls}>{lang === 'ar' ? 'الوصف' : 'Description'}</label>
                  <textarea value={editor.description} onChange={e => patch('description', e.target.value)} rows={2} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>{lang === 'ar' ? 'الأولوية' : 'Priority'}</label>
                  <select value={editor.priority} onChange={e => patch('priority', e.target.value)} className={inputCls}>
                    {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>{lang === 'ar' ? 'الفئة' : 'Category'}</label>
                  <select value={editor.category} onChange={e => patch('category', e.target.value)} className={inputCls}>
                    <option value="">{lang === 'ar' ? '— بدون —' : '— none —'}</option>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>{lang === 'ar' ? 'الأصل' : 'Asset'}</label>
                  <select value={editor.asset_id} onChange={e => patch('asset_id', e.target.value)} className={inputCls}>
                    <option value="">{lang === 'ar' ? '— بدون —' : '— none —'}</option>
                    {assets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>{lang === 'ar' ? 'مُسند إلى' : 'Assign To'}</label>
                  <select value={editor.assigned_to} onChange={e => patch('assigned_to', e.target.value)} className={inputCls}>
                    <option value="">{lang === 'ar' ? '— بدون —' : '— unassigned —'}</option>
                    {technicians.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>{lang === 'ar' ? 'المدة المقدرة (دقائق)' : 'Est. Duration (min)'}</label>
                  <input type="number" min="0" value={editor.estimated_duration} onChange={e => patch('estimated_duration', e.target.value)} className={inputCls} />
                </div>
              </div>
            </div>

            <div className="border-t border-outline-variant/30 pt-4">
              <label className={labelCls}>{lang === 'ar' ? 'المهام' : 'Tasks'}</label>
              {editor.items.map((it, i) => (
                <div key={i} className="flex gap-2 mb-2 items-center">
                  <span className="text-xs text-on-surface-variant w-5 text-center">{i + 1}.</span>
                  <input value={it.title} onChange={e => updateItem(i, 'title', e.target.value)} placeholder={lang === 'ar' ? 'المهمة (إنجليزي)' : 'Task (English)'} className={inputCls + ' flex-1'} />
                  <input value={it.title_ar} onChange={e => updateItem(i, 'title_ar', e.target.value)} placeholder={lang === 'ar' ? 'المهمة (عربي)' : 'Task (Arabic)'} dir="rtl" className={inputCls + ' flex-1'} />
                  <button type="button" onClick={() => removeItem(i)} aria-label="remove"
                    className="w-7 h-7 rounded-full bg-error/10 text-error border-none cursor-pointer text-sm flex items-center justify-center flex-shrink-0 hover:bg-error/20 transition-colors">×</button>
                </div>
              ))}
              <button type="button" onClick={addItem} className="text-primary text-sm font-semibold bg-transparent border-none cursor-pointer hover:underline px-0">
                {lang === 'ar' ? '+ إضافة مهمة' : '+ Add task'}
              </button>
            </div>

            {error && <p className="text-error text-sm m-0">{error}</p>}
            <div className="flex gap-2">
              <button onClick={save} disabled={saving}
                className="bg-primary text-on-primary px-4 py-2 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-60">
                {saving ? (lang === 'ar' ? 'جارٍ الحفظ...' : 'Saving...') : (lang === 'ar' ? 'حفظ القالب' : 'Save Template')}
              </button>
              <button onClick={() => setEditor(null)}
                className="border border-outline-variant text-on-surface-variant px-4 py-2 rounded-xl text-sm font-semibold hover:bg-surface-container-low transition-colors">
                {lang === 'ar' ? 'إلغاء' : 'Cancel'}
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-on-surface-variant py-8 text-center">Loading...</div>
        ) : templates.length === 0 && !editor ? (
          <div className="text-center py-16 text-on-surface-variant bg-surface-container-lowest border border-outline-variant rounded-[12px]">
            <span className="material-symbols-outlined text-5xl mb-3 block text-outline-variant">description</span>
            <p className="text-lg font-semibold mb-1">{lang === 'ar' ? 'لا توجد قوالب بعد' : 'No templates yet'}</p>
            <p className="text-sm">{lang === 'ar' ? 'أنشئ قالباً لبدء أوامر العمل المتكررة بسرعة.' : 'Create a template to start recurring work orders quickly.'}</p>
          </div>
        ) : templates.length > 0 && (
          <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] overflow-hidden shadow-sm">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-surface-container border-b border-outline-variant/30">
                  {[lang === 'ar' ? 'الاسم' : 'Name', lang === 'ar' ? 'الفئة' : 'Category', lang === 'ar' ? 'المهام' : 'Tasks', ''].map((h, i) => (
                    <th key={i} className="p-3 text-left text-xs font-semibold uppercase tracking-wider text-on-surface-variant whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/20">
                {templates.map(tpl => (
                  <tr key={tpl.id} className="transition-colors hover:bg-surface-container-low">
                    <td className="p-3">
                      <p className="text-sm font-semibold text-on-surface m-0">{lang === 'ar' && tpl.name_ar ? tpl.name_ar : tpl.name}</p>
                      {tpl.title && <p className="text-xs text-on-surface-variant m-0 mt-0.5">{tpl.title}</p>}
                    </td>
                    <td className="p-3 text-sm text-on-surface-variant whitespace-nowrap">{tpl.category ?? '—'}</td>
                    <td className="p-3 text-sm text-on-surface-variant whitespace-nowrap">{(Array.isArray(tpl.tasks) ? tpl.tasks.length : 0)}</td>
                    <td className="p-3 whitespace-nowrap text-right">
                      <a href={`/dashboard/work-orders/new?template=${tpl.id}`}
                        className="text-xs px-2.5 py-1 mr-1.5 border border-outline-variant rounded-lg cursor-pointer text-primary hover:bg-primary/10 bg-surface transition-colors no-underline">
                        {lang === 'ar' ? 'استخدام' : 'Use'}
                      </a>
                      <button onClick={() => startEdit(tpl)}
                        className="text-xs px-2.5 py-1 mr-1.5 border border-outline-variant rounded-lg cursor-pointer text-on-surface-variant hover:bg-surface-container-low bg-surface transition-colors">
                        {lang === 'ar' ? 'تعديل' : 'Edit'}
                      </button>
                      <button onClick={() => remove(tpl)}
                        className="text-xs px-2.5 py-1 border border-outline-variant rounded-lg cursor-pointer text-error hover:bg-error/10 bg-surface transition-colors">
                        {lang === 'ar' ? 'حذف' : 'Delete'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
