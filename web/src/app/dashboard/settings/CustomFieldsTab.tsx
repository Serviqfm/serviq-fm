// web/src/app/dashboard/settings/CustomFieldsTab.tsx
// WO-26: admin-managed custom-field definitions for work orders.
// Writes go through the org-scoped Supabase client (RLS restricts to the caller's
// org); this tab is admin-gated by settings/page.tsx.
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useLanguage } from '@/context/LanguageContext'
import {
  CustomFieldDefinition, CustomFieldType, CUSTOM_FIELD_TYPES,
  CUSTOM_FIELD_TYPE_LABELS, slugifyKey,
} from '@/lib/customFields'

const inputCls = 'w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all'
const labelCls = 'block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5'

const emptyDraft = { label: '', label_ar: '', type: 'text' as CustomFieldType, options: '' }

export default function CustomFieldsTab() {
  const { lang } = useLanguage()
  const supabase = createClient()
  const [orgId, setOrgId] = useState('')
  const [defs, setDefs] = useState<CustomFieldDefinition[]>([])
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
      .from('custom_field_definitions')
      .select('*')
      .eq('organisation_id', profile.organisation_id)
      .eq('entity', 'work_order')
      .order('sort_order')
    if (data) setDefs(data as CustomFieldDefinition[])
    setLoading(false)
  }

  async function addField() {
    setError('')
    const label = draft.label.trim()
    if (!label) { setError(lang === 'ar' ? 'التسمية مطلوبة' : 'Label is required'); return }
    const key = slugifyKey(label)
    if (!key) { setError(lang === 'ar' ? 'تسمية غير صالحة' : 'Invalid label'); return }
    if (defs.some(d => d.key === key)) { setError(lang === 'ar' ? 'حقل بنفس المفتاح موجود' : 'A field with this key already exists'); return }
    const options = draft.type === 'dropdown'
      ? draft.options.split(',').map(o => o.trim()).filter(Boolean)
      : []
    if (draft.type === 'dropdown' && options.length === 0) {
      setError(lang === 'ar' ? 'أضف خيارات القائمة (مفصولة بفواصل)' : 'Add dropdown options (comma-separated)')
      return
    }
    setSaving(true)
    const { error: insErr } = await supabase.from('custom_field_definitions').insert({
      organisation_id: orgId,
      entity: 'work_order',
      key,
      label,
      label_ar: draft.label_ar.trim() || null,
      type: draft.type,
      options,
      sort_order: defs.length,
    })
    setSaving(false)
    if (insErr) { setError(insErr.message); return }
    setDraft(emptyDraft)
    load()
  }

  async function deleteField(id: string) {
    if (!confirm(lang === 'ar' ? 'حذف هذا الحقل؟ القيم المحفوظة تبقى على أوامر العمل.' : 'Delete this field? Values already saved on work orders are kept.')) return
    await supabase.from('custom_field_definitions').delete().eq('id', id)
    load()
  }

  async function toggleActive(def: CustomFieldDefinition) {
    await supabase.from('custom_field_definitions').update({ is_active: !def.is_active }).eq('id', def.id)
    load()
  }

  return (
    <div className="space-y-6">
      <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-6">
        <h3 className="text-base font-semibold text-on-surface mb-1">
          {lang === 'ar' ? 'الحقول المخصصة لأوامر العمل' : 'Work Order Custom Fields'}
        </h3>
        <p className="text-sm text-on-surface-variant mb-5">
          {lang === 'ar'
            ? 'حقول تظهر في نماذج إنشاء وتعديل أوامر العمل.'
            : 'Fields shown on the work-order create and edit forms.'}
        </p>

        {loading ? (
          <div className="text-on-surface-variant text-sm">Loading…</div>
        ) : defs.length === 0 ? (
          <p className="text-sm text-on-surface-variant mb-4">
            {lang === 'ar' ? 'لا توجد حقول مخصصة بعد.' : 'No custom fields yet.'}
          </p>
        ) : (
          <div className="space-y-2 mb-4">
            {defs.map(def => (
              <div key={def.id} className="flex items-center justify-between gap-4 py-2 border-b border-outline-variant/40 last:border-0">
                <div>
                  <div className="text-sm text-on-surface font-medium">
                    {lang === 'ar' && def.label_ar ? def.label_ar : def.label}
                    {!def.is_active && <span className="ml-2 text-[11px] text-on-surface-variant">({lang === 'ar' ? 'غير نشط' : 'inactive'})</span>}
                  </div>
                  <div className="text-[11px] text-on-surface-variant">
                    {def.key} · {CUSTOM_FIELD_TYPE_LABELS[def.type][lang === 'ar' ? 'ar' : 'en']}
                    {def.type === 'dropdown' && def.options.length > 0 && ` · ${def.options.join(', ')}`}
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={() => toggleActive(def)}
                    className="px-3 py-1 rounded-full text-xs text-on-surface-variant border border-outline-variant hover:bg-surface-container-low transition-colors">
                    {def.is_active ? (lang === 'ar' ? 'تعطيل' : 'Disable') : (lang === 'ar' ? 'تفعيل' : 'Enable')}
                  </button>
                  <button onClick={() => deleteField(def.id)}
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
            {lang === 'ar' ? 'إضافة حقل' : 'Add a field'}
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>{lang === 'ar' ? 'التسمية (إنجليزي)' : 'Label (English)'}</label>
              <input className={inputCls} value={draft.label}
                onChange={e => setDraft(d => ({ ...d, label: e.target.value }))}
                placeholder={lang === 'ar' ? 'مثال: رقم الطلب' : 'e.g. PO Number'} />
            </div>
            <div>
              <label className={labelCls}>{lang === 'ar' ? 'التسمية (عربي)' : 'Label (Arabic)'}</label>
              <input className={inputCls} style={{ direction: 'rtl' }} value={draft.label_ar}
                onChange={e => setDraft(d => ({ ...d, label_ar: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>{lang === 'ar' ? 'النوع' : 'Type'}</label>
              <select className={inputCls} value={draft.type}
                onChange={e => setDraft(d => ({ ...d, type: e.target.value as CustomFieldType }))}>
                {CUSTOM_FIELD_TYPES.map(t => (
                  <option key={t} value={t}>{CUSTOM_FIELD_TYPE_LABELS[t][lang === 'ar' ? 'ar' : 'en']}</option>
                ))}
              </select>
            </div>
            {draft.type === 'dropdown' && (
              <div>
                <label className={labelCls}>{lang === 'ar' ? 'الخيارات (مفصولة بفواصل)' : 'Options (comma-separated)'}</label>
                <input className={inputCls} value={draft.options}
                  onChange={e => setDraft(d => ({ ...d, options: e.target.value }))}
                  placeholder={lang === 'ar' ? 'منخفض، متوسط، مرتفع' : 'Low, Medium, High'} />
              </div>
            )}
          </div>
          {error && (
            <div className="mt-3 bg-error/10 border border-error/20 rounded-lg px-3 py-2 text-error text-sm">{error}</div>
          )}
          <button onClick={addField} disabled={saving}
            className="mt-4 bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20 disabled:opacity-50">
            {saving ? (lang === 'ar' ? 'جاري الحفظ…' : 'Saving…') : (lang === 'ar' ? 'إضافة الحقل' : 'Add field')}
          </button>
        </div>
      </div>
    </div>
  )
}
