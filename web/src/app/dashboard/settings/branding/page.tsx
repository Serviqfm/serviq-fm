// web/src/app/dashboard/settings/branding/page.tsx
// W6-5 / MKT-27 — per-tenant custom branding (its own page, reachable by URL —
// same pattern as settings/sso). Admin-gated in the UI; writes go through the
// org-scoped Supabase client (organisations RLS restricts to the caller's org).
// Gated by the custom_branding feature flag — orgs without it see an upsell notice
// and can't set branding, so the app falls back to the default ServIQ brand.
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useLanguage } from '@/context/LanguageContext'
import { useFeatureFlag } from '@/lib/featureFlags'
import { isHexColor } from '@/lib/branding'

const labelCls = 'block text-[11px] font-bold uppercase tracking-wider text-secondary mb-1.5'

const DEFAULT_PRIMARY = '#182848'
const DEFAULT_SECONDARY = '#6DCFB0'

export default function BrandingSettingsPage() {
  const { lang } = useLanguage()
  const { isEnabled, loading: flagsLoading } = useFeatureFlag()
  const supabase = createClient()
  const [orgId, setOrgId] = useState('')
  const [role, setRole] = useState('')
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [primary, setPrimary] = useState(DEFAULT_PRIMARY)
  const [secondary, setSecondary] = useState(DEFAULT_SECONDARY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
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
    // Columns may not exist yet (migration not applied) — treat any error as "unset".
    const { data: org } = await supabase
      .from('organisations')
      .select('brand_logo_url, brand_primary_color, brand_secondary_color')
      .eq('id', profile.organisation_id)
      .single()
    const o = (org ?? {}) as { brand_logo_url?: string | null; brand_primary_color?: string | null; brand_secondary_color?: string | null }
    setLogoUrl(o.brand_logo_url ?? null)
    if (isHexColor(o.brand_primary_color)) setPrimary(o.brand_primary_color)
    if (isHexColor(o.brand_secondary_color)) setSecondary(o.brand_secondary_color)
    setLoading(false)
  }

  async function handleLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !orgId) return
    setError(''); setSaved(false); setUploading(true)
    const ext = (file.name.split('.').pop() || 'png').toLowerCase()
    const path = 'branding/' + orgId + '/logo-' + Date.now() + '.' + ext
    const { error: upErr } = await supabase.storage.from('media').upload(path, file, { cacheControl: '3600', upsert: true })
    setUploading(false)
    if (upErr) { setError(upErr.message); return }
    const { data: urlData } = supabase.storage.from('media').getPublicUrl(path)
    setLogoUrl(urlData.publicUrl)
  }

  async function save() {
    setError(''); setSaved(false)
    // Native <input type="color"> only yields #rrggbb, but re-validate before storing.
    if (!isHexColor(primary) || !isHexColor(secondary)) {
      setError(lang === 'ar' ? 'لون غير صالح.' : 'Invalid colour.')
      return
    }
    setSaving(true)
    const { error: upErr } = await supabase
      .from('organisations')
      .update({
        brand_logo_url: logoUrl || null,
        brand_primary_color: primary,
        brand_secondary_color: secondary,
      })
      .eq('id', orgId)
    setSaving(false)
    if (upErr) { setError(upErr.message); return }
    setSaved(true)
  }

  const isAdmin = role === 'admin'
  const flagOn = isEnabled('custom_branding')

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-headline-h1 font-headline-h1 text-on-surface mb-1">
        {lang === 'ar' ? 'العلامة التجارية المخصصة' : 'Custom Branding'}
      </h1>
      <p className="text-sm text-on-surface-variant mb-6">
        {lang === 'ar'
          ? 'ارفع شعار مؤسستك وحدّد ألوان علامتك التجارية. تظهر على فواتير العملاء وبوابة الطلبات العامة.'
          : 'Upload your organisation’s logo and set your brand colours. They appear on customer invoices and the public request portal.'}
      </p>

      <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-6">
        {loading || flagsLoading ? (
          <div className="text-on-surface-variant text-sm">Loading…</div>
        ) : !isAdmin ? (
          <p className="text-sm text-on-surface-variant">
            {lang === 'ar' ? 'إعدادات العلامة التجارية متاحة لمسؤولي المؤسسة فقط.' : 'Branding settings are available to organisation admins only.'}
          </p>
        ) : !flagOn ? (
          <p className="text-sm text-on-surface-variant">
            {lang === 'ar'
              ? 'العلامة التجارية المخصصة غير متوفرة في خطتك الحالية. تواصل معنا للترقية.'
              : 'Custom branding isn’t included in your current plan. Contact us to upgrade.'}
          </p>
        ) : (
          <>
            <label className={labelCls}>{lang === 'ar' ? 'الشعار' : 'Logo'}</label>
            <div className="flex items-center gap-4 mb-6">
              <div className="w-24 h-24 rounded-xl border border-outline-variant/40 bg-surface-container-low flex items-center justify-center overflow-hidden flex-shrink-0">
                {logoUrl
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={logoUrl} alt="Logo" className="max-w-full max-h-full object-contain" />
                  : <span className="material-symbols-outlined text-outline-variant text-3xl">image</span>}
              </div>
              <div>
                <label htmlFor="logo-upload" className="inline-block border border-outline-variant/40 text-on-surface px-4 py-2 rounded-xl font-semibold text-sm hover:bg-surface-container-low transition-colors cursor-pointer">
                  {uploading ? (lang === 'ar' ? 'جارٍ الرفع…' : 'Uploading…') : (lang === 'ar' ? 'رفع شعار' : 'Upload logo')}
                  <input id="logo-upload" type="file" accept="image/*" onChange={handleLogo} className="hidden" disabled={uploading} />
                </label>
                {logoUrl && (
                  <button onClick={() => setLogoUrl(null)} className="ml-3 text-xs font-semibold uppercase tracking-wider text-error hover:underline">
                    {lang === 'ar' ? 'إزالة' : 'Remove'}
                  </button>
                )}
                <p className="text-[12px] text-on-surface-variant mt-2">PNG · JPG · SVG</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls} htmlFor="primary">{lang === 'ar' ? 'اللون الأساسي' : 'Primary colour'}</label>
                <div className="flex items-center gap-2">
                  <input id="primary" type="color" value={primary} onChange={e => { setPrimary(e.target.value); setSaved(false) }} className="h-11 w-14 rounded-lg border border-outline-variant/40 bg-surface-container-low cursor-pointer" />
                  <span className="text-sm text-on-surface-variant font-mono">{primary}</span>
                </div>
              </div>
              <div>
                <label className={labelCls} htmlFor="secondary">{lang === 'ar' ? 'اللون الثانوي' : 'Secondary colour'}</label>
                <div className="flex items-center gap-2">
                  <input id="secondary" type="color" value={secondary} onChange={e => { setSecondary(e.target.value); setSaved(false) }} className="h-11 w-14 rounded-lg border border-outline-variant/40 bg-surface-container-low cursor-pointer" />
                  <span className="text-sm text-on-surface-variant font-mono">{secondary}</span>
                </div>
              </div>
            </div>

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
              disabled={saving || uploading}
              className="mt-6 bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20 disabled:opacity-50"
            >
              {saving ? (lang === 'ar' ? 'جاري الحفظ…' : 'Saving…') : (lang === 'ar' ? 'حفظ' : 'Save')}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
