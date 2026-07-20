// web/src/app/dashboard/settings/purchasing/page.tsx
// B8 / FM-17: org-admin toggle for the Purchase Orders module (its own page, by
// URL — same pattern as settings/statuses). Reads/writes
// organisations.purchasing_enabled (b8-partials.sql); the PO pages check the
// same flag and show a disabled notice when it's off. The po_* notification
// preferences stay in Settings → Notifications.
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { useLanguage } from '@/context/LanguageContext'

export default function PurchasingSettingsPage() {
  const { lang } = useLanguage()
  const supabase = createClient()
  const [orgId, setOrgId] = useState('')
  const [role, setRole] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
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
    // Separate query so a missing column (pre-migration) just leaves the
    // permissive default-on state — same philosophy as lib/featureFlags.ts.
    const { data: org } = await supabase
      .from('organisations')
      .select('purchasing_enabled')
      .eq('id', profile.organisation_id)
      .single()
    setEnabled(org?.purchasing_enabled !== false)
    setLoading(false)
  }

  async function toggle(next: boolean) {
    setError('')
    setSaving(true)
    const { error: updErr } = await supabase
      .from('organisations')
      .update({ purchasing_enabled: next, updated_at: new Date().toISOString() })
      .eq('id', orgId)
    setSaving(false)
    if (updErr) { setError(updErr.message); return }
    setEnabled(next)
  }

  const isAdmin = role === 'admin' || role === 'manager'

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-headline-h1 font-headline-h1 text-on-surface mb-1">
        {lang === 'ar' ? 'إعدادات المشتريات' : 'Purchasing Settings'}
      </h1>
      <p className="text-sm text-on-surface-variant mb-6">
        {lang === 'ar'
          ? 'تفعيل أو تعطيل وحدة أوامر الشراء لمؤسستك.'
          : 'Enable or disable the Purchase Orders module for your organisation.'}
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
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-on-surface">
                  {lang === 'ar' ? 'وحدة أوامر الشراء' : 'Purchase Orders module'}
                </div>
                <p className="text-[12px] text-on-surface-variant mt-1">
                  {lang === 'ar'
                    ? 'إنشاء أوامر شراء من المخزون واستلامها في المخزون مع قيود دفتر الأستاذ.'
                    : 'Raise POs from inventory and receive them into stock with ledger entries.'}
                </p>
              </div>
              <button onClick={() => toggle(!enabled)} disabled={saving}
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors flex-shrink-0 ${enabled
                  ? 'bg-primary text-on-primary hover:bg-primary/90'
                  : 'border border-outline-variant text-on-surface-variant hover:bg-surface-container-low'} ${saving ? 'opacity-50' : ''}`}>
                {saving ? '…' : enabled ? (lang === 'ar' ? 'مفعّل' : 'Enabled') : (lang === 'ar' ? 'معطّل' : 'Disabled')}
              </button>
            </div>
            {!enabled && (
              <p className="text-[12px] text-on-surface-variant mt-3">
                {lang === 'ar'
                  ? 'صفحات أوامر الشراء مخفية حتى إعادة التفعيل. لا تُحذف أي بيانات.'
                  : 'The Purchase Orders pages are hidden until re-enabled. No data is deleted.'}
              </p>
            )}
            {error && (
              <div className="mt-3 bg-error/10 border border-error/20 rounded-lg px-3 py-2 text-error text-sm">{error}</div>
            )}
            <div className="border-t border-outline-variant/40 pt-4 mt-5 text-[12px] text-on-surface-variant">
              {lang === 'ar' ? 'تُدار إشعارات أوامر الشراء من ' : 'Purchase Order notification preferences are managed under '}
              <Link href="/dashboard/settings" className="text-primary hover:underline">
                {lang === 'ar' ? 'الإعدادات ← الإشعارات' : 'Settings → Notifications'}
              </Link>.
              {' '}
              <Link href="/dashboard/purchase-orders" className="text-primary hover:underline">
                {lang === 'ar' ? 'فتح أوامر الشراء' : 'Open Purchase Orders'}
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
