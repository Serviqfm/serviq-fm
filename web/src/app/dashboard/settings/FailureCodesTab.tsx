// web/src/app/dashboard/settings/FailureCodesTab.tsx
// MKT-15: admin/manager-managed failure codes applied at WO closure.
// Requires SQL Files/w6-1-failure-codes.sql. Writes go through the org-scoped
// Supabase client (RLS restricts to the caller's org AND admin/manager role);
// this tab is admin/manager-gated in settings/page.tsx. Styled after CategoriesTab.
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useLanguage } from '@/context/LanguageContext'

const inputCls = 'w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all'
const labelCls = 'block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5'

type FailureCode = { id: string; code: string; label: string; label_ar: string | null; is_active: boolean }

const emptyDraft = { code: '', label: '', label_ar: '' }

export default function FailureCodesTab() {
  const { lang } = useLanguage()
  const supabase = createClient()
  const [orgId, setOrgId] = useState('')
  const [codes, setCodes] = useState<FailureCode[]>([])
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
      .from('failure_codes')
      .select('*')
      .eq('organisation_id', profile.organisation_id)
      .order('code')
    if (data) setCodes(data as FailureCode[])
    setLoading(false)
  }

  async function addCode() {
    setError('')
    const code = draft.code.trim()
    const label = draft.label.trim()
    if (!code || !label) { setError(lang === 'ar' ? 'الرمز والوصف مطلوبان' : 'Code and label are required'); return }
    if (codes.some(c => c.code.toLowerCase() === code.toLowerCase())) {
      setError(lang === 'ar' ? 'رمز بنفس الاسم موجود' : 'A failure code with this code already exists'); return
    }
    setSaving(true)
    const { error: insErr } = await supabase.from('failure_codes').insert({
      organisation_id: orgId,
      code,
      label,
      label_ar: draft.label_ar.trim() || null,
    })
    setSaving(false)
    if (insErr) { setError(insErr.message); return }
    setDraft(emptyDraft)
    load()
  }

  async function deleteCode(id: string) {
    if (!confirm(lang === 'ar'
      ? 'حذف هذا الرمز؟ لا يمكن حذف رمز مستخدم في أوامر عمل — عطّله بدلاً من ذلك.'
      : 'Delete this failure code? A code used on work orders cannot be deleted — disable it instead.')) return
    const { error: delErr } = await supabase.from('failure_codes').delete().eq('id', id)
    if (delErr) { setError(delErr.message); return }
    load()
  }

  async function toggleActive(fc: FailureCode) {
    await supabase.from('failure_codes').update({ is_active: !fc.is_active }).eq('id', fc.id)
    load()
  }

  return (
    <div className="space-y-6">
      <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-6">
        <h3 className="text-base font-semibold text-on-surface mb-1">
          {lang === 'ar' ? 'رموز الأعطال' : 'Failure Codes'}
        </h3>
        <p className="text-sm text-on-surface-variant mb-5">
          {lang === 'ar'
            ? 'رموز اختيارية تُسجل عند إغلاق أمر العمل لتقارير الموثوقية.'
            : 'Optional codes recorded when a work order is closed, for reliability reporting.'}
        </p>

        {loading ? (
          <div className="text-on-surface-variant text-sm">Loading…</div>
        ) : codes.length === 0 ? (
          <p className="text-sm text-on-surface-variant mb-4">
            {lang === 'ar'
              ? 'لا توجد رموز أعطال بعد.'
              : 'No failure codes yet — add some below to enable the field on WO close.'}
          </p>
        ) : (
          <div className="space-y-2 mb-4">
            {codes.map(fc => (
              <div key={fc.id} className="flex items-center justify-between gap-4 py-2 border-b border-outline-variant/40 last:border-0">
                <div>
                  <div className="text-sm text-on-surface font-medium">
                    <span className="font-mono text-xs bg-surface-container-low rounded px-1.5 py-0.5 mr-2">{fc.code}</span>
                    {lang === 'ar' && fc.label_ar ? fc.label_ar : fc.label}
                    {!fc.is_active && <span className="ml-2 text-[11px] text-on-surface-variant">({lang === 'ar' ? 'غير نشط' : 'inactive'})</span>}
                  </div>
                  {fc.label_ar && <div className="text-[11px] text-on-surface-variant">{fc.label}</div>}
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={() => toggleActive(fc)}
                    className="px-3 py-1 rounded-full text-xs text-on-surface-variant border border-outline-variant hover:bg-surface-container-low transition-colors">
                    {fc.is_active ? (lang === 'ar' ? 'تعطيل' : 'Disable') : (lang === 'ar' ? 'تفعيل' : 'Enable')}
                  </button>
                  <button onClick={() => deleteCode(fc.id)}
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
            {lang === 'ar' ? 'إضافة رمز' : 'Add a failure code'}
          </h4>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>{lang === 'ar' ? 'الرمز' : 'Code'}</label>
              <input className={inputCls} value={draft.code}
                onChange={e => setDraft(d => ({ ...d, code: e.target.value }))}
                placeholder="e.g. BRG-WEAR" />
            </div>
            <div>
              <label className={labelCls}>{lang === 'ar' ? 'الوصف (إنجليزي)' : 'Label (English)'}</label>
              <input className={inputCls} value={draft.label}
                onChange={e => setDraft(d => ({ ...d, label: e.target.value }))}
                placeholder={lang === 'ar' ? 'مثال: تآكل المحمل' : 'e.g. Bearing wear'} />
            </div>
            <div>
              <label className={labelCls}>{lang === 'ar' ? 'الوصف (عربي)' : 'Label (Arabic)'}</label>
              <input className={inputCls} style={{ direction: 'rtl' }} value={draft.label_ar}
                onChange={e => setDraft(d => ({ ...d, label_ar: e.target.value }))} />
            </div>
          </div>
          {error && (
            <div className="mt-3 bg-error/10 border border-error/20 rounded-lg px-3 py-2 text-error text-sm">{error}</div>
          )}
          <button onClick={addCode} disabled={saving}
            className="mt-4 bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20 disabled:opacity-50">
            {saving ? (lang === 'ar' ? 'جاري الحفظ…' : 'Saving…') : (lang === 'ar' ? 'إضافة الرمز' : 'Add code')}
          </button>
        </div>
      </div>
    </div>
  )
}
