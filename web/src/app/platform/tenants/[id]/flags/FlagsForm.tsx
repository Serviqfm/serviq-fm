'use client'
import { useEffect, useState } from 'react'
import { TenantFlags, invalidateFeatureFlagCache } from '@/lib/featureFlags'

// P0: has_cafm / has_procurement are organisations columns, not tenant_feature_flags,
// but the API route serves and saves them alongside the flags so the admin edits
// everything in one place.
type FormFlags = TenantFlags & { has_cafm: boolean; has_procurement: boolean }

const WORKSPACE_KEYS: (keyof FormFlags)[] = ['has_cafm', 'has_procurement']
const FLAG_KEYS: (keyof FormFlags)[] = ['advanced_reporting', 'api_access', 'invoicing', 'multi_site', 'custom_branding']
const FLAG_LABELS: Record<keyof FormFlags, string> = {
  advanced_reporting: 'Advanced reporting',
  api_access: 'API access',
  invoicing: 'Invoicing',
  multi_site: 'Multi-site',
  custom_branding: 'Custom branding',
  has_cafm: 'CAFM workspace',
  has_procurement: 'Procurement workspace',
}

export default function FlagsForm({ tenantId }: { tenantId: string }) {
  const [flags, setFlags] = useState<FormFlags | null>(null)
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
    invalidateFeatureFlagCache()
    setSaved(true); setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] p-6 max-w-xl space-y-3">
      <div className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Workspaces</div>
      {WORKSPACE_KEYS.map(k => (
        <div key={k} className="flex items-center justify-between py-2 border-b border-outline-variant/40">
          <span className="text-sm text-on-surface">{FLAG_LABELS[k]}</span>
          <button onClick={() => setFlags(f => f && { ...f, [k]: !f[k] })}
            className={flags[k]
              ? 'px-4 py-1.5 rounded-full bg-primary text-on-primary text-xs font-semibold'
              : 'px-4 py-1.5 rounded-full bg-surface-container-low text-on-surface-variant text-xs font-semibold border border-outline-variant'}>
            {flags[k] ? 'On' : 'Off'}
          </button>
        </div>
      ))}
      <div className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant pt-2">Feature flags</div>
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
        Workspaces route the tenant: <strong>CAFM</strong> is /dashboard, <strong>Procurement</strong> is /dashboard/procurement, both on shows a workspace picker. Turning both off leaves the tenant on CAFM.
      </p>
      <p className="text-[11px] text-on-surface-variant">
        Enforced today: <strong>invoicing</strong> hides the Invoices nav for tenant users, <strong>advanced_reporting</strong> hides Reports, <strong>multi_site</strong> blocks adding a second Site. Other flags (<strong>api_access</strong>, <strong>custom_branding</strong>) persist but do not yet gate features.
      </p>
    </div>
  )
}
