// web/src/app/dashboard/settings/access/page.tsx
// 1C-13 "Limited Technician": org-level toggle for assigned-only technician
// visibility (its own page, reachable by URL — same pattern as settings/sso).
// Reads/writes go through /api/settings/access (admin-gated, service role).
// App-side technician scoping (CORE-21) is already unconditional; this toggle
// arms the durable RLS layer shipped in 1c-13-limited-technician.sql.
'use client'

import { useEffect, useState } from 'react'
import { useLanguage } from '@/context/LanguageContext'

export default function AccessSettingsPage() {
  const { lang } = useLanguage()
  const [role, setRole] = useState('')
  const [limited, setLimited] = useState(false)
  const [migrated, setMigrated] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/settings/access')
      .then((r) => r.json())
      .then((d) => {
        setRole(d.role ?? '')
        setLimited(!!d.limit_technician_visibility)
        setMigrated(d.migrated !== false)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function save(next: boolean) {
    setError(''); setSaved(false); setSaving(true)
    const prev = limited
    setLimited(next)
    const res = await fetch('/api/settings/access', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit_technician_visibility: next }),
    }).catch(() => null)
    setSaving(false)
    if (!res || !res.ok) {
      setLimited(prev)
      const msg = res ? (await res.json().catch(() => ({}))).error : null
      setError(msg || (lang === 'ar' ? 'تعذّر الحفظ.' : 'Failed to save.'))
      return
    }
    setSaved(true)
  }

  const isAdmin = role === 'admin' || role === 'manager'

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-headline-h1 font-headline-h1 text-on-surface mb-1">
        {lang === 'ar' ? 'التحكم في الوصول' : 'Access control'}
      </h1>
      <p className="text-sm text-on-surface-variant mb-6">
        {lang === 'ar'
          ? 'إعدادات على مستوى المؤسسة تحدد ما يمكن لكل دور رؤيته.'
          : 'Organisation-wide settings for what each role can see.'}
      </p>

      <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-6">
        {loading ? (
          <div className="text-on-surface-variant text-sm">Loading…</div>
        ) : !isAdmin ? (
          <p className="text-sm text-on-surface-variant">
            {lang === 'ar'
              ? 'إعدادات التحكم في الوصول متاحة لمسؤولي المؤسسة فقط.'
              : 'Access control settings are available to organisation admins only.'}
          </p>
        ) : (
          <>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={limited}
                disabled={saving}
                onChange={(e) => save(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-[var(--color-primary,#2563eb)]"
              />
              <span>
                <span className="block text-sm font-semibold text-on-surface">
                  {lang === 'ar'
                    ? 'الفني المحدود: يرى أوامر العمل المسندة إليه فقط'
                    : 'Limited technician: see assigned work orders only'}
                </span>
                <span className="block text-[12px] text-on-surface-variant mt-1">
                  {lang === 'ar'
                    ? 'عند التفعيل، يرى الفنيون فقط أوامر العمل التي أُسندت إليهم (كمسؤول أو عامل إضافي) أو التي أنشؤوها — ويُفرض ذلك على مستوى قاعدة البيانات. لا يتأثر المديرون والمسؤولون.'
                    : 'When on, technicians can only see work orders they are assigned to (as assignee or additional worker) or created — enforced at the database layer. Managers and admins are unaffected.'}
                </span>
              </span>
            </label>

            {!migrated && (
              <div className="mt-4 bg-error/10 border border-error/20 rounded-lg px-3 py-2 text-error text-sm">
                {lang === 'ar'
                  ? 'لم يتم تطبيق ترحيل قاعدة البيانات (1c-13-limited-technician.sql) بعد.'
                  : 'Database migration (1c-13-limited-technician.sql) has not been applied yet.'}
              </div>
            )}
            {error && (
              <div className="mt-4 bg-error/10 border border-error/20 rounded-lg px-3 py-2 text-error text-sm">{error}</div>
            )}
            {saved && (
              <div className="mt-4 bg-primary/10 border border-primary/20 rounded-lg px-3 py-2 text-primary text-sm">
                {lang === 'ar' ? 'تم الحفظ.' : 'Saved.'}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
