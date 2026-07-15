// web/src/app/dashboard/settings/CategoriesTab.tsx
// WO-04: admin/manager-managed work-order categories.
// Writes go through the org-scoped Supabase client (RLS restricts to the caller's
// org AND admin/manager role); this tab is admin/manager-gated in settings/page.tsx.
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useLanguage } from '@/context/LanguageContext'

const inputCls = 'w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all'
const labelCls = 'block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5'

type Category = { id: string; name: string; name_ar: string | null; sort_order: number; is_active: boolean }

const emptyDraft = { name: '', name_ar: '' }

export default function CategoriesTab() {
  const { lang } = useLanguage()
  const supabase = createClient()
  const [orgId, setOrgId] = useState('')
  const [cats, setCats] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState(emptyDraft)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])

  async function load() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data: profile } = await supabase.from('users').select('organisation_id').eq('id', user.id).single()
    if (!profile) { setLoading(false); return }
    setOrgId(profile.organisation_id)
    const { data } = await supabase
      .from('work_order_categories')
      .select('*')
      .eq('organisation_id', profile.organisation_id)
      .order('sort_order')
    if (data) setCats(data as Category[])
    setLoading(false)
  }

  async function addCategory() {
    setError('')
    const name = draft.name.trim()
    if (!name) { setError(lang === 'ar' ? 'الاسم مطلوب' : 'Name is required'); return }
    if (cats.some(c => c.name.toLowerCase() === name.toLowerCase())) {
      setError(lang === 'ar' ? 'فئة بنفس الاسم موجودة' : 'A category with this name already exists'); return
    }
    setSaving(true)
    const { error: insErr } = await supabase.from('work_order_categories').insert({
      organisation_id: orgId,
      name,
      name_ar: draft.name_ar.trim() || null,
      sort_order: cats.length,
    })
    setSaving(false)
    if (insErr) { setError(insErr.message); return }
    setDraft(emptyDraft)
    load()
  }

  async function deleteCategory(id: string) {
    if (!confirm(lang === 'ar'
      ? 'حذف هذه الفئة؟ أوامر العمل الحالية تحتفظ بقيمتها.'
      : 'Delete this category? Existing work orders keep their value.')) return
    await supabase.from('work_order_categories').delete().eq('id', id)
    load()
  }

  async function toggleActive(cat: Category) {
    await supabase.from('work_order_categories').update({ is_active: !cat.is_active }).eq('id', cat.id)
    load()
  }

  return (
    <div className="space-y-6">
      <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-6">
        <h3 className="text-base font-semibold text-on-surface mb-1">
          {lang === 'ar' ? 'فئات أوامر العمل' : 'Work Order Categories'}
        </h3>
        <p className="text-sm text-on-surface-variant mb-5">
          {lang === 'ar'
            ? 'الفئات التي تظهر في قوائم إنشاء وتعديل أوامر العمل.'
            : 'Categories shown in the work-order create and edit dropdowns.'}
        </p>

        {loading ? (
          <div className="text-on-surface-variant text-sm">Loading…</div>
        ) : cats.length === 0 ? (
          <p className="text-sm text-on-surface-variant mb-4">
            {lang === 'ar'
              ? 'لا توجد فئات مخصصة بعد — يتم استخدام القائمة الافتراضية.'
              : 'No categories yet — the default list is used until you add some.'}
          </p>
        ) : (
          <div className="space-y-2 mb-4">
            {cats.map(cat => (
              <div key={cat.id} className="flex items-center justify-between gap-4 py-2 border-b border-outline-variant/40 last:border-0">
                <div>
                  <div className="text-sm text-on-surface font-medium">
                    {lang === 'ar' && cat.name_ar ? cat.name_ar : cat.name}
                    {!cat.is_active && <span className="ml-2 text-[11px] text-on-surface-variant">({lang === 'ar' ? 'غير نشط' : 'inactive'})</span>}
                  </div>
                  {cat.name_ar && <div className="text-[11px] text-on-surface-variant">{cat.name}</div>}
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={() => toggleActive(cat)}
                    className="px-3 py-1 rounded-full text-xs text-on-surface-variant border border-outline-variant hover:bg-surface-container-low transition-colors">
                    {cat.is_active ? (lang === 'ar' ? 'تعطيل' : 'Disable') : (lang === 'ar' ? 'تفعيل' : 'Enable')}
                  </button>
                  <button onClick={() => deleteCategory(cat.id)}
                    className="px-3 py-1 rounded-full text-xs text-error border border-error/30 hover:bg-error/10 transition-colors">
                    {lang === 'ar' ? 'حذف' : 'Delete'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="border-t border-outline-variant/40 pt-5 mt-5">
          <h4 className="text-sm font-semibold text-on-surface mb-3">
            {lang === 'ar' ? 'إضافة فئة' : 'Add a category'}
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>{lang === 'ar' ? 'الاسم (إنجليزي)' : 'Name (English)'}</label>
              <input className={inputCls} value={draft.name}
                onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                placeholder={lang === 'ar' ? 'مثال: تكييف' : 'e.g. HVAC'} />
            </div>
            <div>
              <label className={labelCls}>{lang === 'ar' ? 'الاسم (عربي)' : 'Name (Arabic)'}</label>
              <input className={inputCls} style={{ direction: 'rtl' }} value={draft.name_ar}
                onChange={e => setDraft(d => ({ ...d, name_ar: e.target.value }))} />
            </div>
          </div>
          {error && (
            <div className="mt-3 bg-error/10 border border-error/20 rounded-lg px-3 py-2 text-error text-sm">{error}</div>
          )}
          <button onClick={addCategory} disabled={saving}
            className="mt-4 bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20 disabled:opacity-50">
            {saving ? (lang === 'ar' ? 'جاري الحفظ…' : 'Saving…') : (lang === 'ar' ? 'إضافة الفئة' : 'Add category')}
          </button>
        </div>
      </div>
    </div>
  )
}
