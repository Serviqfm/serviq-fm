'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useLanguage } from '@/context/LanguageContext'
import { ChecklistTemplate, ChecklistTemplateItem } from '@/types/work-order'

const inputCls = 'w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-on-surface-variant/40'
const labelCls = 'block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5'

interface EditorState {
  id: string | null
  name: string
  name_ar: string
  items: { title: string; title_ar: string }[]
}

const emptyEditor: EditorState = { id: null, name: '', name_ar: '', items: [{ title: '', title_ar: '' }] }

export default function ChecklistTemplatesPage() {
  const supabase = createClient()
  const { lang } = useLanguage()
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([])
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
    const { data } = await supabase
      .from('checklist_templates')
      .select('*')
      .eq('organisation_id', profile.organisation_id)
      .order('name')
    if (data) setTemplates(data as ChecklistTemplate[])
    setLoading(false)
  }

  function startCreate() {
    setError('')
    setEditor({ ...emptyEditor, items: [{ title: '', title_ar: '' }] })
  }

  function startEdit(tpl: ChecklistTemplate) {
    setError('')
    setEditor({
      id: tpl.id,
      name: tpl.name,
      name_ar: tpl.name_ar ?? '',
      items: (Array.isArray(tpl.items) ? tpl.items : []).map((it: ChecklistTemplateItem) => ({
        title: it.title ?? '',
        title_ar: it.title_ar ?? '',
      })),
    })
  }

  function updateItem(index: number, field: 'title' | 'title_ar', value: string) {
    setEditor(prev => prev ? {
      ...prev,
      items: prev.items.map((it, i) => i === index ? { ...it, [field]: value } : it),
    } : prev)
  }

  function addItem() {
    setEditor(prev => prev ? { ...prev, items: [...prev.items, { title: '', title_ar: '' }] } : prev)
  }

  function removeItem(index: number) {
    setEditor(prev => prev ? { ...prev, items: prev.items.filter((_, i) => i !== index) } : prev)
  }

  async function save() {
    if (!editor) return
    setError('')
    if (!editor.name.trim()) {
      setError(lang === 'ar' ? 'اسم القالب مطلوب' : 'Template name is required')
      return
    }
    const items = editor.items
      .filter(it => it.title.trim() || it.title_ar.trim())
      .map(it => ({
        title: it.title.trim() || it.title_ar.trim(),
        ...(it.title_ar.trim() ? { title_ar: it.title_ar.trim() } : {}),
      }))
    if (items.length === 0) {
      setError(lang === 'ar' ? 'أضف عنصراً واحداً على الأقل' : 'Add at least one item')
      return
    }
    setSaving(true)
    const row = {
      name: editor.name.trim(),
      name_ar: editor.name_ar.trim() ? editor.name_ar.trim() : null,
      items,
    }
    const { error: err } = editor.id
      ? await supabase.from('checklist_templates').update(row).eq('id', editor.id)
      : await supabase.from('checklist_templates').insert({ ...row, organisation_id: orgId })
    setSaving(false)
    if (err) {
      setError(err.message || (lang === 'ar' ? 'فشل الحفظ' : 'Failed to save'))
      return
    }
    setEditor(null)
    await load()
  }

  async function remove(tpl: ChecklistTemplate) {
    if (!confirm(lang === 'ar' ? `حذف القالب "${tpl.name_ar ?? tpl.name}"؟` : `Delete template "${tpl.name}"?`)) return
    await supabase.from('checklist_templates').delete().eq('id', tpl.id)
    await load()
  }

  return (
    <div className="star-pattern bg-surface min-h-screen p-8">
      <div className="max-w-[860px] mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <a href="/dashboard/work-orders" className="text-on-surface-variant text-sm hover:text-primary transition-colors">
              {lang === 'ar' ? 'العودة إلى أوامر العمل' : 'Back to Work Orders'}
            </a>
            <h1 className="text-2xl font-bold text-on-surface mt-2">
              {lang === 'ar' ? 'قوالب قوائم المهام' : 'Checklist Templates'}
            </h1>
            <p className="text-on-surface-variant mt-1 text-sm">
              {lang === 'ar'
                ? 'قوالب جاهزة لمهام أوامر العمل — طبّقها عند إنشاء أمر عمل جديد.'
                : 'Reusable task lists — apply them when creating a new work order.'}
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
              {editor.id
                ? (lang === 'ar' ? 'تعديل القالب' : 'Edit Template')
                : (lang === 'ar' ? 'قالب جديد' : 'New Template')}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>{lang === 'ar' ? 'الاسم (إنجليزي)' : 'Name (English)'} <span className="text-error">*</span></label>
                <input value={editor.name} onChange={e => setEditor(prev => prev ? { ...prev, name: e.target.value } : prev)}
                  placeholder="e.g. AC Quarterly PM" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>{lang === 'ar' ? 'الاسم (عربي)' : 'Name (Arabic)'}</label>
                <input value={editor.name_ar} onChange={e => setEditor(prev => prev ? { ...prev, name_ar: e.target.value } : prev)}
                  placeholder={lang === 'ar' ? 'مثال: صيانة المكيف الربعية' : 'اسم القالب بالعربية'} dir="rtl" className={inputCls} />
              </div>
            </div>

            <div>
              <label className={labelCls}>{lang === 'ar' ? 'عناصر القائمة' : 'Checklist Items'}</label>
              {editor.items.map((it, i) => (
                <div key={i} className="flex gap-2 mb-2 items-center">
                  <span className="text-xs text-on-surface-variant w-5 text-center">{i + 1}.</span>
                  <input value={it.title} onChange={e => updateItem(i, 'title', e.target.value)}
                    placeholder={lang === 'ar' ? 'العنصر (إنجليزي)' : 'Item (English)'} className={inputCls + ' flex-1'} />
                  <input value={it.title_ar} onChange={e => updateItem(i, 'title_ar', e.target.value)}
                    placeholder={lang === 'ar' ? 'العنصر (عربي)' : 'Item (Arabic)'} dir="rtl" className={inputCls + ' flex-1'} />
                  <button type="button" onClick={() => removeItem(i)}
                    className="w-7 h-7 rounded-full bg-error/10 text-error border-none cursor-pointer text-sm flex items-center justify-center flex-shrink-0 hover:bg-error/20 transition-colors"
                    aria-label={lang === 'ar' ? 'إزالة العنصر' : 'Remove item'}>
                    ×
                  </button>
                </div>
              ))}
              <button type="button" onClick={addItem}
                className="text-primary text-sm font-semibold bg-transparent border-none cursor-pointer hover:underline px-0">
                {lang === 'ar' ? '+ إضافة عنصر' : '+ Add item'}
              </button>
            </div>

            {error && <p className="text-error text-sm m-0">{error}</p>}

            <div className="flex gap-2">
              <button onClick={save} disabled={saving}
                className="bg-primary text-on-primary px-4 py-2 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
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
            <span className="material-symbols-outlined text-5xl mb-3 block text-outline-variant">checklist</span>
            <p className="text-lg font-semibold mb-1">{lang === 'ar' ? 'لا توجد قوالب بعد' : 'No templates yet'}</p>
            <p className="text-sm">{lang === 'ar' ? 'أنشئ أول قالب لقائمة مهام لإعادة استخدامه في أوامر العمل.' : 'Create your first checklist template to reuse on work orders.'}</p>
          </div>
        ) : templates.length > 0 && (
          <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] overflow-hidden shadow-sm">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-surface-container border-b border-outline-variant/30">
                  {[
                    lang === 'ar' ? 'الاسم' : 'Name',
                    lang === 'ar' ? 'العناصر' : 'Items',
                    lang === 'ar' ? 'أُنشئ' : 'Created',
                    '',
                  ].map((h, i) => (
                    <th key={i} className="p-3 text-left text-xs font-semibold uppercase tracking-wider text-on-surface-variant whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/20">
                {templates.map(tpl => (
                  <tr key={tpl.id} className="transition-colors hover:bg-surface-container-low">
                    <td className="p-3">
                      <p className="text-sm font-semibold text-on-surface m-0">{lang === 'ar' && tpl.name_ar ? tpl.name_ar : tpl.name}</p>
                      {tpl.name_ar && lang !== 'ar' && <p className="text-xs text-on-surface-variant m-0 mt-0.5" dir="rtl">{tpl.name_ar}</p>}
                    </td>
                    <td className="p-3 text-sm text-on-surface-variant whitespace-nowrap">
                      {(Array.isArray(tpl.items) ? tpl.items.length : 0)} {lang === 'ar' ? 'عنصر' : 'items'}
                    </td>
                    <td className="p-3 text-sm text-on-surface-variant whitespace-nowrap">
                      {tpl.created_at ? new Date(tpl.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                    </td>
                    <td className="p-3 whitespace-nowrap text-right">
                      <button onClick={() => startEdit(tpl)}
                        className="text-xs px-2.5 py-1 mr-1.5 border border-outline-variant rounded-lg cursor-pointer text-primary hover:bg-primary/10 bg-surface transition-colors">
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
