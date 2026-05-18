'use client'
import { useEffect, useState } from 'react'
import { TenantFlags } from '@/lib/featureFlags'

const FLAG_KEYS: (keyof TenantFlags)[] = ['advanced_reporting', 'api_access', 'invoicing', 'multi_site', 'custom_branding']
const FLAG_LABELS: Record<keyof TenantFlags, string> = {
  advanced_reporting: 'Advanced reporting',
  api_access: 'API access',
  invoicing: 'Invoicing',
  multi_site: 'Multi-site',
  custom_branding: 'Custom branding',
}

export default function FlagsForm({ tenantId }: { tenantId: string }) {
  const [flags, setFlags] = useState<TenantFlags | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/platform/tenants/${tenantId}/flags`).then(r => r.json()).then(d => setFlags(d.flags))
  }, [tenantId])

  if (!flags) return <div className="text-on-surface-variant">Loading…</div>

  async function save() {
    setSaving(true); setError('')
    const res = await fetch(`/api/platform/tenants/${tenantId}/flags`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(flags),
    })
    setSaving(false)
    if (!res.ok) { const j = await res.json(); setError(j.error); return }
    setSaved(true); setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] p-6 max-w-xl space-y-3">
      {FLAG_KEYS.map(k => (
        <div key={k} className="flex items-center justify-between py-2 border-b border-outline-variant/40 last:border-0">
          <span className="text-sm text-on-surface">{FLAG_LABELS[k]}</span>
          <button onClick={() => setFlags(f => f && { ...f, [k]: !f[k] })}
            className={flags[k]
              ? 'px-4 py-1.5 rounded-full bg-primary text-on-primary text-xs font-semibold'
              : 'px-4 py-1.5 rounded-full bg-surface-container-low text-on-surface-variant text-xs font-semibold border border-outline-variant'}>
            {flags[k] ? 'On' : 'Off'}
          </button>
        </div>
      ))}
      {error && <div className="bg-error/10 text-error border border-error/20 rounded-lg px-3 py-2 text-sm">{error}</div>}
      <div className="flex gap-3 items-center pt-2">
        <button onClick={save} disabled={saving}
          className="bg-primary text-on-primary px-5 py-2.5 rounded-xl font-semibold text-sm disabled:opacity-50">
          {saving ? 'Saving…' : 'Save'}
        </button>
        {saved && <span className="text-primary text-sm font-semibold">Saved</span>}
      </div>
      <p className="text-[11px] text-on-surface-variant pt-2">
        Note: feature-flag enforcement is not yet wired in this release. These toggles are stored and audited but do not gate any feature.
      </p>
    </div>
  )
}
