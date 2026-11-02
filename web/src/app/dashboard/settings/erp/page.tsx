// web/src/app/dashboard/settings/erp/page.tsx
// P7 + W7-02: ERP integration settings — provider picker, per-provider
// connection form (Odoo / Business Central / Oracle Fusion), Test connection,
// and the sync log with Retry on failed rows.
//
// Provider "none" records every vendor-created / PO-sent / invoice-approved event
// as 'skipped' (nothing sent). A live provider pushes to the ERP.
//
// SECRETS: this page never reads or writes erp_connections / erp_credentials
// through the Supabase SDK. Everything goes through the admin-only /api/erp/*
// routes, which encrypt secrets server-side and only ever send back
// "configured ✓ / last 4 chars". A blank secret field keeps the stored value.
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { useLanguage } from '@/context/LanguageContext'
import { PROVIDER_FIELDS, fieldApplies, isConnectorProvider, type FieldSpec } from '@/lib/erp/fields'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any

const PROVIDERS: { id: string; en: string; ar: string; live: boolean }[] = [
  { id: 'none', en: 'None (record events only)', ar: 'بدون (تسجيل الأحداث فقط)', live: true },
  { id: 'odoo', en: 'Odoo', ar: 'أودو', live: true },
  { id: 'dynamics', en: 'Microsoft Dynamics 365 Business Central', ar: 'مايكروسوفت دايناميكس 365 بيزنس سنترال', live: true },
  { id: 'oracle', en: 'Oracle Fusion Cloud ERP', ar: 'أوراكل فيوجن كلاود ERP', live: true },
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
  const [config, setConfig] = useState<Record<string, string>>({})
  const [secrets, setSecrets] = useState<Record<string, string>>({})
  const [hints, setHints] = useState<Record<string, { configured?: boolean; last4?: string | null }>>({})
  const [hintsProvider, setHintsProvider] = useState('')
  const [encryptionOk, setEncryptionOk] = useState(true)
  const [schemaReady, setSchemaReady] = useState(true)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [retrying, setRetrying] = useState('')

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data: profile } = await supabase
      .from('users').select('organisation_id, role').eq('id', user.id).single()
    if (!profile) { setLoading(false); return }
    setRole(profile.role ?? '')

    // The log is RLS-readable by admin + manager; the connection only via the admin route.
    const lRes = await supabase.from('erp_sync_log').select('*')
      .eq('organisation_id', profile.organisation_id)
      .order('created_at', { ascending: false }).limit(50)
    setLog(lRes.data ?? [])

    if (profile.role === 'admin') {
      const res = await fetch('/api/erp/connection', { cache: 'no-store' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        // Pre-migration the table is missing; say so instead of rendering an editor that cannot save.
        if (res.status === 503) setAvailable(false)
        else setError(j.error ?? 'Failed to load')
      } else {
        const c = j.connection
        setConnection(c ?? null)
        setProvider(c?.provider ?? 'none')
        setActive(c?.is_active ?? false)
        setConfig(Object.fromEntries(Object.entries(c?.config ?? {}).map(([k, v]) => [k, String(v)])))
        setHints(j.credentials?.hints ?? {})
        setHintsProvider(j.credentials?.provider ?? '')
        setEncryptionOk(!!j.encryptionConfigured)
        setSchemaReady(!!j.schemaReady)
        setSecrets({})
        if (c?.last_test_at) setTestResult({ ok: !!c.last_test_ok, message: c.last_test_message ?? '' })
      }
    } else if (lRes.error) {
      setAvailable(false)
    }
    setLoading(false)
  }

  async function save() {
    setError(''); setSaved(false); setSaving(true)
    const res = await fetch('/api/erp/connection', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, is_active: active, config, secrets }),
    })
    const j = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { setError(j.error ?? (isAr ? 'تعذّر الحفظ' : 'Save failed')); return }
    setSaved(true)
    setTestResult(null)
    setTimeout(() => setSaved(false), 2500)
    load()
  }

  async function testConnection() {
    setTesting(true); setTestResult(null)
    const res = await fetch('/api/erp/test', { method: 'POST' })
    const j = await res.json().catch(() => ({}))
    setTesting(false)
    setTestResult(res.ok ? { ok: !!j.ok, message: j.message ?? '' } : { ok: false, message: j.error ?? 'Test failed' })
  }

  async function retry(logId: string) {
    setRetrying(logId); setError('')
    const res = await fetch('/api/erp/retry', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ log_id: logId }),
    })
    const j = await res.json().catch(() => ({}))
    setRetrying('')
    if (!res.ok) setError(j.error ?? 'Retry failed')
    load()
  }

  function pickProvider(id: string) {
    setProvider(id)
    setSecrets({})
    setTestResult(null)
    // Seed defaults (e.g. BC environment "production", Oracle auth "basic") for a fresh provider.
    if (isConnectorProvider(id) && id !== connection?.provider) {
      const seeded: Record<string, string> = {}
      for (const f of PROVIDER_FIELDS[id]) if (!f.secret && f.defaultValue) seeded[f.key] = f.defaultValue
      setConfig(seeded)
    } else if (id === connection?.provider) {
      setConfig(Object.fromEntries(Object.entries(connection?.config ?? {}).map(([k, v]) => [k, String(v)])))
    }
  }

  const isAdmin = role === 'admin'
  const canReadLog = role === 'admin' || role === 'manager'
  const liveProvider = isConnectorProvider(provider) ? provider : null
  const fields: FieldSpec[] = liveProvider ? PROVIDER_FIELDS[liveProvider].filter(f => fieldApplies(f, config)) : []
  const inputCls = 'w-full px-3 py-2 rounded-lg border border-outline-variant bg-surface-container-lowest text-sm text-on-surface'

  function secretPlaceholder(f: FieldSpec): string {
    const h = hintsProvider === provider ? hints[f.key] : undefined
    if (h?.configured) {
      const tail = h.last4 ? ` ••••${h.last4}` : ''
      return isAr ? `محفوظ ✓${tail} — اتركه فارغاً للإبقاء عليه` : `Configured ✓${tail} — leave blank to keep`
    }
    return isAr ? 'غير محدد' : 'Not set'
  }

  if (loading) return <div className="p-8 text-on-surface-variant">{isAr ? 'جارٍ التحميل…' : 'Loading…'}</div>

  return (
    <div className="p-6 max-w-3xl mx-auto" dir={isAr ? 'rtl' : 'ltr'}>
      <h1 className="text-headline-h1 font-headline-h1 text-on-surface mb-1">
        {isAr ? 'تكامل تخطيط الموارد (ERP)' : 'ERP Integration'}
      </h1>
      <p className="text-sm text-on-surface-variant mb-6">
        {isAr
          ? 'اربط المشتريات بنظام تخطيط الموارد: تُرسَل الموردون وأوامر الشراء المرسلة والفواتير المعتمدة تلقائياً.'
          : 'Connect procurement to your ERP: new vendors, sent purchase orders and approved invoices are pushed automatically.'}
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
                        checked={provider === p.id} onChange={() => pickProvider(p.id)}
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

                {liveProvider && (
                  <div className="space-y-3 mb-5 border-t border-outline-variant/40 pt-4">
                    {!encryptionOk && (
                      <div className="bg-error/10 border border-error/20 rounded-lg px-3 py-2 text-error text-sm">
                        {isAr
                          ? 'تخزين بيانات الاعتماد غير مهيأ على الخادم (ERP_ENCRYPTION_KEY). لا يمكن حفظ الأسرار حتى يتم ضبطه.'
                          : 'Credential storage is not configured on the server (ERP_ENCRYPTION_KEY). Secrets cannot be saved until it is set.'}
                      </div>
                    )}
                    {!schemaReady && (
                      <div className="bg-secondary/10 border border-secondary/20 rounded-lg px-3 py-2 text-secondary text-sm">
                        {isAr
                          ? 'لم يتم تشغيل w7-02-erp-connectors.sql بعد — لا يمكن حفظ بيانات الاعتماد.'
                          : 'w7-02-erp-connectors.sql has not been run yet — credentials cannot be saved.'}
                      </div>
                    )}
                    {fields.map(f => (
                      <div key={f.key}>
                        <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                          {isAr ? f.ar : f.en}{f.required && <span className="text-error"> *</span>}
                          {f.secret && <span className="ms-2 text-[10px] uppercase tracking-wider text-outline">{isAr ? 'سرّي' : 'secret'}</span>}
                        </label>
                        {f.kind === 'select' ? (
                          <select className={inputCls} value={config[f.key] ?? f.defaultValue ?? ''}
                            onChange={e => setConfig(c => ({ ...c, [f.key]: e.target.value }))}>
                            {f.options?.map(o => <option key={o.value} value={o.value}>{isAr ? o.ar : o.en}</option>)}
                          </select>
                        ) : f.secret ? (
                          <input type="password" autoComplete="new-password" className={inputCls} dir="ltr"
                            value={secrets[f.key] ?? ''} placeholder={secretPlaceholder(f)}
                            onChange={e => setSecrets(s => ({ ...s, [f.key]: e.target.value }))} />
                        ) : (
                          <input type={f.kind === 'url' ? 'url' : 'text'} inputMode={f.kind === 'number' ? 'numeric' : undefined}
                            className={inputCls} dir="ltr" placeholder={f.placeholder}
                            value={config[f.key] ?? ''}
                            onChange={e => setConfig(c => ({ ...c, [f.key]: e.target.value }))} />
                        )}
                        {f.help && <p className="text-[11px] text-on-surface-variant mt-1">{isAr ? f.help.ar : f.help.en}</p>}
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between gap-4 border-t border-outline-variant/40 pt-4">
                  <div>
                    <div className="text-sm font-semibold text-on-surface">{isAr ? 'تفعيل' : 'Enabled'}</div>
                    <p className="text-[12px] text-on-surface-variant mt-1">
                      {liveProvider
                        ? (isAr
                          ? 'عند التفعيل، تُرسَل أحداث المورد وأمر الشراء والفاتورة إلى نظام ERP وتُسجَّل في سجل المزامنة.'
                          : 'When on, vendor, PO and invoice events are sent to the ERP and recorded in the sync log.')
                        : (isAr
                          ? 'عند التفعيل، تُسجَّل أحداث المورد وأمر الشراء والفاتورة في سجل المزامنة.'
                          : 'When on, vendor, PO and invoice events are recorded in the sync log.')}
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
                  {liveProvider && connection?.provider === provider && (
                    <button onClick={testConnection} disabled={testing}
                      className="px-5 py-2.5 rounded-xl font-semibold text-sm border border-outline-variant text-on-surface hover:bg-surface-container-low disabled:opacity-50">
                      {testing ? (isAr ? 'جارٍ الاختبار…' : 'Testing…') : (isAr ? 'اختبار الاتصال' : 'Test connection')}
                    </button>
                  )}
                  {saved && <span className="text-primary text-sm font-semibold">{isAr ? 'تم الحفظ' : 'Saved'}</span>}
                  {connection?.updated_at && (
                    <span className="text-xs text-outline ms-auto">
                      {isAr ? 'آخر تحديث' : 'Last updated'}: {new Date(connection.updated_at).toLocaleString()}
                    </span>
                  )}
                </div>

                {testResult && liveProvider && (
                  <div className={`mt-4 rounded-lg px-3 py-2 text-sm border ${testResult.ok ? 'bg-primary/10 border-primary/20 text-primary' : 'bg-error/10 border-error/20 text-error'}`}>
                    <span className="font-semibold">{testResult.ok ? (isAr ? 'نجح الاتصال' : 'Connection OK') : (isAr ? 'فشل الاتصال' : 'Connection failed')}</span>
                    {testResult.message && <span className="block text-xs mt-0.5" dir="ltr">{testResult.message}</span>}
                  </div>
                )}
                {liveProvider && connection?.provider !== provider && (
                  <p className="text-[11px] text-on-surface-variant mt-3">
                    {isAr ? 'احفظ أولاً ثم اختبر الاتصال.' : 'Save first, then test the connection.'}
                  </p>
                )}

                <p className="text-[11px] text-on-surface-variant mt-4">
                  {isAr
                    ? 'تُشفَّر الأسرار (مفاتيح API وكلمات المرور) على الخادم ولا تُعرض مرة أخرى — يظهر فقط أنها محفوظة وآخر 4 أحرف.'
                    : 'Secrets (API keys, passwords) are encrypted on the server and never shown again — only that they are set and their last 4 characters.'}
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
                            {r.error && <span className="block text-xs text-error mt-0.5" dir="ltr">{r.error}</span>}
                            {r.external_id && <span className="block text-[11px] text-outline mt-0.5" dir="ltr">ERP #{r.external_id}</span>}
                            {isAdmin && r.status === 'failed' && ['vendor', 'purchase_order', 'invoice'].includes(r.object_type) && r.object_id && (
                              <button onClick={() => retry(r.id)} disabled={retrying === r.id}
                                className="mt-1 text-xs font-semibold text-primary hover:underline disabled:opacity-50">
                                {retrying === r.id ? '…' : (isAr ? 'إعادة المحاولة' : 'Retry')}
                              </button>
                            )}
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
