// web/src/app/dashboard/settings/FormFieldsTab.tsx
'use client'

import { useEffect, useState } from 'react'
import { useLanguage } from '@/context/LanguageContext'
import {
  FIELD_CATALOG, FieldPage, FieldVisibility, PAGE_LABELS, ALL_PAGES
} from '@/lib/field-catalog'

const visibilities: FieldVisibility[] = ['required', 'optional', 'hidden']

export default function FormFieldsTab() {
  const { lang } = useLanguage()
  const [selectedPage, setSelectedPage] = useState<FieldPage>('work_orders_new')
  const [config, setConfig] = useState<Map<string, FieldVisibility>>(new Map())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    setError('')
    fetch(`/api/field-configs?page=${selectedPage}`)
      .then(r => r.json())
      .then(data => {
        if (data.config) setConfig(new Map(Object.entries(data.config) as [string, FieldVisibility][]))
        setLoading(false)
      })
      .catch(() => {
        setError('Failed to load configuration')
        setLoading(false)
      })
  }, [selectedPage])

  function setFieldVis(key: string, vis: FieldVisibility) {
    setConfig(prev => {
      const next = new Map(prev)
      next.set(key, vis)
      return next
    })
  }

  async function save() {
    setSaving(true)
    setError('')
    const overrides: Record<string, FieldVisibility> = {}
    for (const meta of FIELD_CATALOG[selectedPage]) {
      if (meta.is_system_required) continue
      const vis = config.get(meta.key) ?? meta.default_visibility
      overrides[meta.key] = vis
    }
    try {
      const res = await fetch(`/api/field-configs/${selectedPage}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ overrides }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Save failed')
        setSaving(false)
        return
      }
      if (data.config) setConfig(new Map(Object.entries(data.config) as [string, FieldVisibility][]))
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid grid-cols-[220px_1fr] gap-6">
      <nav className="space-y-1">
        {ALL_PAGES.map(page => (
          <button
            key={page}
            onClick={() => setSelectedPage(page)}
            className={selectedPage === page
              ? 'block w-full text-start px-3 py-2 rounded-lg bg-primary/10 text-primary text-sm font-semibold'
              : 'block w-full text-start px-3 py-2 rounded-lg text-sm text-on-surface-variant hover:bg-surface-container-low transition-colors'}
          >
            {PAGE_LABELS[page][lang === 'ar' ? 'ar' : 'en']}
          </button>
        ))}
      </nav>

      <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-6">
        <h3 className="text-base font-semibold text-on-surface mb-5">
          {PAGE_LABELS[selectedPage][lang === 'ar' ? 'ar' : 'en']}
        </h3>

        {loading ? (
          <div className="text-on-surface-variant text-sm">Loading…</div>
        ) : (
          <div className="space-y-3">
            {FIELD_CATALOG[selectedPage].map(meta => {
              const vis = meta.is_system_required ? 'required' : (config.get(meta.key) ?? meta.default_visibility)
              return (
                <div key={meta.key} className="flex items-center justify-between gap-4 py-2 border-b border-outline-variant/40 last:border-0">
                  <div>
                    <div className="text-sm text-on-surface font-medium">
                      {lang === 'ar' ? meta.label_ar : meta.label_en}
                      {meta.is_system_required && <span className="ml-2 text-[11px] text-on-surface-variant">🔒 {lang === 'ar' ? 'مطلوب من النظام' : 'Required by system'}</span>}
                    </div>
                    <div className="text-[11px] text-on-surface-variant">{meta.key} · {meta.type}</div>
                  </div>
                  <div className="flex gap-1 bg-surface-container-low rounded-full p-1">
                    {visibilities.map(v => (
                      <button
                        key={v}
                        onClick={() => !meta.is_system_required && setFieldVis(meta.key, v)}
                        disabled={meta.is_system_required && v !== 'required'}
                        className={vis === v
                          ? 'px-3 py-1 rounded-full bg-primary text-on-primary text-xs font-semibold'
                          : 'px-3 py-1 rounded-full text-xs text-on-surface-variant disabled:opacity-30 hover:bg-surface-container-lowest transition-colors'}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {error && (
          <div className="mt-4 bg-error/10 border border-error/20 rounded-lg px-3 py-2 text-error text-sm">
            {error}
          </div>
        )}

        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={save}
            disabled={saving || loading}
            className="bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20 disabled:opacity-50"
          >
            {saving ? (lang === 'ar' ? 'جاري الحفظ…' : 'Saving…') : (lang === 'ar' ? 'حفظ' : 'Save')}
          </button>
          {saved && (
            <span className="text-primary text-sm font-semibold">
              {lang === 'ar' ? 'تم الحفظ' : 'Saved'}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
