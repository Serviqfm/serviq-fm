// web/src/app/dashboard/settings/sso/page.tsx
// B3-C / MKT-20: org-level SSO email domain setting (its own page, reachable by URL).
// Writes go through the org-scoped Supabase client — the existing organisations RLS
// UPDATE policy restricts to the caller's own org; this page is admin-gated in the UI.
// The IdP / SAML metadata itself is configured by the owner in the Supabase dashboard;
// this page only records which email domain routes to that IdP on the login page.
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useLanguage } from '@/context/LanguageContext'

const inputCls = 'w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all'
const labelCls = 'block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5'

// Accept a bare domain or a full email; store the lower-cased domain part only.
function normaliseDomain(raw: string): string {
  const v = raw.trim().toLowerCase()
  return (v.includes('@') ? v.split('@')[1] : v).replace(/^@/, '')
}

export default function SsoSettingsPage() {
  const { lang } = useLanguage()
  const supabase = createClient()
  const [orgId, setOrgId] = useState('')
  const [role, setRole] = useState('')
  const [domain, setDomain] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])

  async function load() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data: profile } = await supabase
      .from('users')
      .select('organisation_id, role')
      .eq('id', user.id)
      .single()
    if (!profile) { setLoading(false); return }
    setOrgId(profile.organisation_id)
    setRole(profile.role ?? '')
    // sso_domain may not exist yet (migration not applied) — treat any error as "unset".
    const { data: org } = await supabase
      .from('organisations')
      .select('sso_domain')
      .eq('id', profile.organisation_id)
      .single()
    setDomain((org as { sso_domain?: string | null } | null)?.sso_domain ?? '')
    setLoading(false)
  }

  async function save() {
    setError(''); setSaved(false)
    const value = normaliseDomain(domain)
    if (value && !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(value)) {
      setError(lang === 'ar' ? 'أدخل نطاقًا صالحًا مثل acme.com' : 'Enter a valid domain like acme.com')
      return
    }
    setSaving(true)
    const { error: upErr } = await supabase
      .from('organisations')
      .update({ sso_domain: value || null })
      .eq('id', orgId)
    setSaving(false)
    if (upErr) { setError(upErr.message); return }
    setDomain(value)
    setSaved(true)
  }

  const isAdmin = role === 'admin' || role === 'manager'

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-headline-h1 font-headline-h1 text-on-surface mb-1">
        {lang === 'ar' ? 'الدخول الموحّد (SSO)' : 'Single Sign-On (SSO)'}
      </h1>
      <p className="text-sm text-on-surface-variant mb-6">
        {lang === 'ar'
          ? 'اربط نطاق بريد مؤسستك بموفّر الهوية (SAML/OIDC). يقوم المستخدمون بتسجيل الدخول عبر موفّر الهوية بدلاً من كلمة المرور.'
          : 'Route your organisation’s email domain to your identity provider (SAML/OIDC). Matching users sign in through the IdP instead of a password.'}
      </p>

      <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-6">
        {loading ? (
          <div className="text-on-surface-variant text-sm">Loading…</div>
        ) : !isAdmin ? (
          <p className="text-sm text-on-surface-variant">
            {lang === 'ar'
              ? 'إعدادات SSO متاحة لمسؤولي المؤسسة فقط.'
              : 'SSO settings are available to organisation admins only.'}
          </p>
        ) : (
          <>
            <label className={labelCls} htmlFor="sso_domain">
              {lang === 'ar' ? 'نطاق البريد الإلكتروني للـ SSO' : 'SSO email domain'}
            </label>
            <input
              id="sso_domain"
              className={inputCls}
              value={domain}
              onChange={(e) => { setDomain(e.target.value); setSaved(false) }}
              placeholder="acme.com"
            />
            <p className="text-[12px] text-on-surface-variant mt-2">
              {lang === 'ar'
                ? 'يجب تكوين بيانات موفّر الهوية (SAML) في لوحة تحكم Supabase من قبل المالك. هذه الصفحة تسجّل النطاق فقط.'
                : 'The IdP / SAML metadata must be configured in the Supabase dashboard by the owner. This page only records the domain.'}
            </p>

            {error && (
              <div className="mt-4 bg-error/10 border border-error/20 rounded-lg px-3 py-2 text-error text-sm">{error}</div>
            )}
            {saved && (
              <div className="mt-4 bg-primary/10 border border-primary/20 rounded-lg px-3 py-2 text-primary text-sm">
                {lang === 'ar' ? 'تم الحفظ.' : 'Saved.'}
              </div>
            )}

            <button
              onClick={save}
              disabled={saving}
              className="mt-5 bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20 disabled:opacity-50"
            >
              {saving ? (lang === 'ar' ? 'جاري الحفظ…' : 'Saving…') : (lang === 'ar' ? 'حفظ' : 'Save')}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
