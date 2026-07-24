// web/src/app/dashboard/settings/asset-fields/page.tsx
// AL-02: admin/manager-managed custom-field definitions for MEP assets (its own
// page, by URL — mirrors settings/statuses). Writes go through the org-scoped
// Supabase client (RLS restricts to the caller's org); the page is role-gated in
// the UI. Mirrors the shipped WO CustomFieldsTab.
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useLanguage } from '@/context/LanguageContext'
import {
  AssetFieldDef, AssetFieldType, ASSET_FIELD_TYPES,
  ASSET_FIELD_TYPE_LABELS, slugifyKey,
} from '@/lib/assetFields'

const inputCls = 'w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all'
const labelCls = 'block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5'

const emptyDraft = { label: '', label_ar: '', type: 'text' as AssetFieldType, options: '' }

export default function AssetFieldsPage() {
  const { lang } = useLanguage()
  const supabase = createClient()
  const [orgId, setOrgId] = useState('')
  const [role, setRole] = useState('')
  const [defs, setDefs] = useState<AssetFieldDef[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState(emptyDraft)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])

  async function load() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data: profile } = await supabase.from('users').select('organisation_id, role').eq('id', user.id).single()
    if (!profile) { setLoading(false); return }
    setOrgId(profile.organisation_id)
    setRole(profile.role ?? '')
    const { data } = await supabase
      .from('asset_field_defs')
      .select('*')
      .eq('organisation_id', profile.organisation_id)
      .order('sort_order')
    if (data) setDefs(data as AssetFieldDef[])
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
    const { error: insErr } = await supabase.from('asset_field_defs').insert({
      organisation_id: orgId,
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
    if (!confirm(lang === 'ar' ? 'حذف هذا الحقل؟ القيم المحفوظة تبقى على الأصول.' : 'Delete this field? Values already saved on assets are kept.')) return
    await supabase.from('asset_field_defs').delete().eq('id', id)
    load()
  }

  async function toggleActive(def: AssetFieldDef) {
    await supabase.from('asset_field_defs').update({ is_active: !def.is_active }).eq('id', def.id)
    load()
  }

  const isAdmin = role === 'admin' || role === 'manager'

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-headline-h1 font-headline-h1 text-on-surface mb-1">
        {lang === 'ar' ? 'الحقول المخصصة للأصول' : 'Asset Custom Fields'}
      </h1>
      <p className="text-sm text-on-surface-variant mb-6">
        {lang === 'ar'
          ? 'حقول تظهر في نماذج إنشاء وتعديل الأصول (مثل رقم اللوحة أو الجهد الكهربائي).'
          : 'Fields shown on the asset create and edit forms (e.g. plate number, voltage rating).'}
      </p>

      <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-6">
        {loading ? (
          <div className="text-on-surface-variant text-sm">Loading…</div>
        ) : !isAdmin ? (
          <p className="text-sm text-on-surface-variant">
            {lang === 'ar'
              ? 'هذه الإعدادات متاحة لمسؤولي ومديري المؤسسة فقط.'
              : 'These settings are available to organisation admins and managers only.'}
          </p>
        ) : (
          <>
            {defs.length === 0 ? (
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
                        {def.key} · {ASSET_FIELD_TYPE_LABELS[def.type][lang === 'ar' ? 'ar' : 'en']}
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
                    placeholder={lang === 'ar' ? 'مثال: الجهد' : 'e.g. Voltage'} />
                </div>
                <div>
                  <label className={labelCls}>{lang === 'ar' ? 'التسمية (عربي)' : 'Label (Arabic)'}</label>
                  <input className={inputCls} style={{ direction: 'rtl' }} value={draft.label_ar}
                    onChange={e => setDraft(d => ({ ...d, label_ar: e.target.value }))} />
                </div>
                <div>
                  <label className={labelCls}>{lang === 'ar' ? 'النوع' : 'Type'}</label>
                  <select className={inputCls} value={draft.type}
                    onChange={e => setDraft(d => ({ ...d, type: e.target.value as AssetFieldType }))}>
                    {ASSET_FIELD_TYPES.map(t => (
                      <option key={t} value={t}>{ASSET_FIELD_TYPE_LABELS[t][lang === 'ar' ? 'ar' : 'en']}</option>
                    ))}
                  </select>
                </div>
                {draft.type === 'dropdown' && (
                  <div>
                    <label className={labelCls}>{lang === 'ar' ? 'الخيارات (مفصولة بفواصل)' : 'Options (comma-separated)'}</label>
                    <input className={inputCls} value={draft.options}
                      onChange={e => setDraft(d => ({ ...d, options: e.target.value }))}
                      placeholder={lang === 'ar' ? '١١٠ فولت، ٢٢٠ فولت' : '110V, 220V'} />
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
          </>
        )}
      </div>
    </div>
  )
}
