// web/src/app/dashboard/settings/erp/page.tsx
// P7: ERP integration settings — provider picker and the sync log.
//
// V1 is framework-only: real providers are shown but disabled ("coming soon").
// Enabling the connection with provider "none" turns the framework on, so every
// vendor-created / PO-sent / invoice-approved event is recorded in the sync log
// as 'skipped' — proof the hooks fire, with nothing sent anywhere.
//
// Writes go straight through PostgREST; erp_connections is admin-only in RLS, so
// the database enforces the gate and this page only hides what it would refuse.
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { useLanguage } from '@/context/LanguageContext'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any

const PROVIDERS: { id: string; en: string; ar: string; live: boolean }[] = [
  { id: 'none', en: 'None (record events only)', ar: 'بدون (تسجيل الأحداث فقط)', live: true },
  { id: 'oracle', en: 'Oracle', ar: 'أوراكل', live: false },
  { id: 'dynamics', en: 'Microsoft Dynamics', ar: 'مايكروسوفت دايناميكس', live: false },
  { id: 'odoo', en: 'Odoo', ar: 'أودو', live: false },
]

const STATUS_CLS: Record<string, string> = {
  skipped: 'bg-outline-variant/20 text-on-surface-variant',
  success: 'bg-primary/10 text-primary',
  pending: 'bg-secondary/10 text-secondary',
  failed: 'bg-error/10 text-error',
}

export default function ErpSettingsPage() {
  const { lang } = useLanguage()
  const isAr = lang === 'ar'
  const supabase = createClient()

  const [orgId, setOrgId] = useState('')
  const [role, setRole] = useState('')
  const [available, setAvailable] = useState(true)
  const [connection, setConnection] = useState<Row>(null)
  const [provider, setProvider] = useState('none')
  const [active, setActive] = useState(false)
  const [log, setLog] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data: profile } = await supabase
      .from('users').select('organisation_id, role').eq('id', user.id).single()
    if (!profile) { setLoading(false); return }
    setOrgId(profile.organisation_id)
    setRole(profile.role ?? '')

    const [cRes, lRes] = await Promise.all([
      supabase.from('erp_connections').select('*').eq('organisation_id', profile.organisation_id).maybeSingle(),
      supabase.from('erp_sync_log').select('*')
        .eq('organisation_id', profile.organisation_id)
        .order('created_at', { ascending: false }).limit(50),
    ])
    // Pre-migration the table is missing; say so instead of rendering an editor
    // that cannot save.
    if (cRes.error && lRes.error) setAvailable(false)
    setConnection(cRes.data ?? null)
    setProvider(cRes.data?.provider ?? 'none')
    setActive(cRes.data?.is_active ?? false)
    setLog(lRes.data ?? [])
    setLoading(false)
  }

  async function save() {
    setError(''); setSaved(false); setSaving(true)
    const { error: upErr } = await supabase.from('erp_connections').upsert({
      organisation_id: orgId,
      provider,
      is_active: active,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'organisation_id' })
    setSaving(false)
    if (upErr) { setError(upErr.message); return }
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
    load()
  }

  const isAdmin = role === 'admin'
  const canReadLog = role === 'admin' || role === 'manager'

  if (loading) return <div className="p-8 text-on-surface-variant">{isAr ? 'جارٍ التحميل…' : 'Loading…'}</div>

  return (
    <div className="p-6 max-w-3xl mx-auto" dir={isAr ? 'rtl' : 'ltr'}>
      <h1 className="text-headline-h1 font-headline-h1 text-on-surface mb-1">
        {isAr ? 'تكامل تخطيط الموارد (ERP)' : 'ERP Integration'}
      </h1>
      <p className="text-sm text-on-surface-variant mb-6">
        {isAr
          ? 'اربط المشتريات بنظام تخطيط الموارد. الموصلات المباشرة قادمة لاحقاً؛ حالياً تُسجَّل الأحداث فقط.'
          : 'Connect procurement to your ERP. Live connectors are coming; today, events are recorded only.'}
      </p>

      {!available ? (
        <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] p-6 text-sm text-on-surface-variant">
          {isAr
            ? 'تكامل ERP غير متاح — لم يتم تشغيل procurement-08-erp.sql بعد.'
            : 'ERP integration is unavailable — procurement-08-erp.sql has not been run yet.'}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-6">
            <h2 className="text-sm font-semibold text-on-surface mb-4">{isAr ? 'الاتصال' : 'Connection'}</h2>

            {!isAdmin ? (
              <p className="text-sm text-on-surface-variant">
                {isAr ? 'إعدادات الاتصال متاحة للمسؤولين فقط.' : 'Connection settings are available to admins only.'}
              </p>
            ) : (
              <>
                <div className="space-y-2 mb-5">
                  {PROVIDERS.map(p => (
                    <label key={p.id}
                      className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                        !p.live ? 'opacity-60 cursor-not-allowed border-outline-variant/40'
                          : provider === p.id ? 'border-primary bg-primary/5 cursor-pointer'
                          : 'border-outline-variant hover:bg-surface-container-low cursor-pointer'
                      }`}>
                      <input type="radio" name="provider" value={p.id} disabled={!p.live}
                        checked={provider === p.id} onChange={() => setProvider(p.id)}
                        className="accent-primary" />
                      <span className="text-sm text-on-surface flex-1">{isAr ? p.ar : p.en}</span>
                      {!p.live && (
                        <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-surface-container-low text-on-surface-variant">
                          {isAr ? 'قريباً' : 'Coming soon'}
                        </span>
                      )}
                    </label>
                  ))}
                </div>

                <div className="flex items-center justify-between gap-4 border-t border-outline-variant/40 pt-4">
                  <div>
                    <div className="text-sm font-semibold text-on-surface">{isAr ? 'تفعيل' : 'Enabled'}</div>
                    <p className="text-[12px] text-on-surface-variant mt-1">
                      {isAr
                        ? 'عند التفعيل، تُسجَّل أحداث المورد وأمر الشراء والفاتورة في سجل المزامنة.'
                        : 'When on, vendor, PO and invoice events are recorded in the sync log.'}
                    </p>
                  </div>
                  <button onClick={() => setActive(a => !a)}
                    className={active
                      ? 'px-4 py-1.5 rounded-full bg-primary text-on-primary text-xs font-semibold'
                      : 'px-4 py-1.5 rounded-full bg-surface-container-low text-on-surface-variant text-xs font-semibold border border-outline-variant'}>
                    {active ? (isAr ? 'مفعّل' : 'On') : (isAr ? 'معطّل' : 'Off')}
                  </button>
                </div>

                {error && <div className="mt-4 bg-error/10 border border-error/20 rounded-lg px-3 py-2 text-error text-sm">{error}</div>}

                <div className="flex items-center gap-3 mt-5">
                  <button onClick={save} disabled={saving}
                    className="bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm disabled:opacity-50">
                    {saving ? '…' : (isAr ? 'حفظ' : 'Save')}
                  </button>
                  {saved && <span className="text-primary text-sm font-semibold">{isAr ? 'تم الحفظ' : 'Saved'}</span>}
                  {connection?.updated_at && (
                    <span className="text-xs text-outline ms-auto">
                      {isAr ? 'آخر تحديث' : 'Last updated'}: {new Date(connection.updated_at).toLocaleString()}
                    </span>
                  )}
                </div>

                <p className="text-[11px] text-on-surface-variant mt-4">
                  {isAr
                    ? 'لا تُخزَّن أي بيانات اعتماد هنا. عند توفر الموصلات، تُحفظ الأسرار في متغيرات البيئة.'
                    : 'No credentials are ever stored here. When connectors arrive, secrets live in environment config.'}
                </p>
              </>
            )}
          </div>

          {canReadLog && (
            <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-6">
              <h2 className="text-sm font-semibold text-on-surface mb-3">
                {isAr ? 'سجل المزامنة (آخر 50)' : 'Sync log (last 50)'}
              </h2>
              {log.length === 0 ? (
                <p className="text-sm text-on-surface-variant">
                  {isAr
                    ? 'لا توجد أحداث بعد. فعّل الاتصال ثم أرسل أمر شراء لتظهر أول مدخلة.'
                    : 'No events yet. Enable the connection, then send a purchase order to see the first entry.'}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="bg-surface-container-low border-b border-outline-variant/30">
                        {[
                          isAr ? 'الوقت' : 'When',
                          isAr ? 'الكائن' : 'Object',
                          isAr ? 'الاتجاه' : 'Direction',
                          isAr ? 'المزوّد' : 'Provider',
                          isAr ? 'الحالة' : 'Status',
                        ].map(h => (
                          <th key={h} className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-on-surface-variant whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/20">
                      {log.map(r => (
                        <tr key={r.id}>
                          <td className="px-3 py-2 text-xs text-on-surface-variant whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                          <td className="px-3 py-2 text-sm text-on-surface">{String(r.object_type).replace(/_/g, ' ')}</td>
                          <td className="px-3 py-2 text-sm text-on-surface-variant">{r.direction}</td>
                          <td className="px-3 py-2 text-sm text-on-surface-variant">{r.provider}</td>
                          <td className="px-3 py-2">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_CLS[r.status] ?? ''}`}>
                              {r.status}
                            </span>
                            {r.error && <span className="block text-xs text-error mt-0.5">{r.error}</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          <Link href="/dashboard/settings" className="text-primary text-sm hover:underline">
            {isAr ? 'العودة إلى الإعدادات' : 'Back to Settings'}
          </Link>
        </div>
      )}
    </div>
  )
}
