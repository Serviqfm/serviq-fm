'use client'

// AP-06 — plan usage metering. Shows the org's current usage vs the caps from
// planLimits.ts (the same source the enforcement paths read). null cap = unlimited
// (shown as "Unlimited"); an unknown/null plan_tier means no caps are enforced, so
// every meter reads unlimited — matching the FAIL-OPEN rule in planLimits.ts.

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useLanguage } from '@/context/LanguageContext'
import { planLimits, type PlanLimits } from '@/lib/planLimits'

type Row = { label: string; label_ar: string; used: number; cap: number | null; unit?: string }

export default function UsagePage() {
  const supabase = createClient()
  const { lang } = useLanguage()
  const isAr = lang === 'ar'
  const [loading, setLoading] = useState(true)
  const [tier, setTier] = useState<string | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [storageGb, setStorageGb] = useState<number | null>(null)

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      const { data: profile } = await supabase
        .from('users')
        .select('organisation_id, organisation:organisation_id(plan_tier)')
        .eq('id', user.id)
        .single()
      const orgId = profile?.organisation_id
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const planTier = ((profile as any)?.organisation?.plan_tier ?? null) as string | null
      if (!orgId) { setLoading(false); return }

      const limits: PlanLimits | null = planLimits(planTier)

      const [seats, sites, openWos, keys] = await Promise.all([
        supabase.from('users').select('id', { count: 'exact', head: true })
          .eq('organisation_id', orgId).eq('is_active', true),
        supabase.from('sites').select('id', { count: 'exact', head: true })
          .eq('organisation_id', orgId).eq('is_active', true),
        supabase.from('work_orders').select('id', { count: 'exact', head: true })
          .eq('organisation_id', orgId).not('status', 'in', '(completed,closed)'),
        supabase.from('api_keys').select('id', { count: 'exact', head: true })
          .eq('organisation_id', orgId).is('revoked_at', null),
      ])

      setTier(planTier)
      setStorageGb(limits?.storageGb ?? null)
      setRows([
        { label: 'Seats', label_ar: 'المقاعد', used: seats.count ?? 0, cap: limits?.maxSeats ?? null },
        { label: 'Sites', label_ar: 'المواقع', used: sites.count ?? 0, cap: limits?.maxSites ?? null },
        { label: 'Open work orders', label_ar: 'أوامر العمل المفتوحة', used: openWos.count ?? 0, cap: limits?.maxOpenWorkOrders ?? null },
        // API keys have no per-tier cap; api access itself is gated (apiAccess). Shown for visibility.
        { label: 'Active API keys', label_ar: 'مفاتيح API النشطة', used: keys.count ?? 0, cap: null },
      ])
      setLoading(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (loading) return <div className="p-8 text-on-surface-variant">{isAr ? 'جارٍ التحميل…' : 'Loading…'}</div>

  return (
    <div className="star-pattern bg-surface min-h-screen p-8">
      <div className="max-w-[800px] mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-on-surface mb-2">
            {isAr ? 'الاستخدام' : 'Usage'}
          </h1>
          <p className="text-sm text-on-surface-variant mb-6">
            {isAr
              ? `استخدام مؤسستك مقابل حدود الخطة${tier ? ` (${tier})` : ''}`
              : `Your organisation's usage against its plan limits${tier ? ` (${tier})` : ''}`}
          </p>

          <div className="bg-surface-container-lowest border border-outline-variant rounded-[12px] shadow-sm p-6 space-y-5">
            {rows.map(r => {
              const pct = r.cap != null && r.cap > 0 ? Math.min(100, Math.round((r.used / r.cap) * 100)) : null
              const atCap = r.cap != null && r.used >= r.cap
              return (
                <div key={r.label}>
                  <div className="flex items-baseline justify-between mb-1.5">
                    <span className="text-sm font-medium text-on-surface">{isAr ? r.label_ar : r.label}</span>
                    <span className={`text-sm font-semibold ${atCap ? 'text-error' : 'text-on-surface-variant'}`}>
                      {r.used}
                      {r.cap != null ? ` / ${r.cap}` : ` · ${isAr ? 'غير محدود' : 'Unlimited'}`}
                    </span>
                  </div>
                  {pct != null && (
                    <div className="h-2 rounded-full bg-surface-container-high overflow-hidden">
                      <div
                        className={`h-full rounded-full ${atCap ? 'bg-error' : 'bg-primary'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  )}
                </div>
              )
            })}

            {/* Storage — displayed metric only (not enforced; see planLimits.ts). */}
            <div className="pt-1 border-t border-outline-variant/40">
              <div className="flex items-baseline justify-between pt-4">
                <span className="text-sm font-medium text-on-surface">{isAr ? 'حد التخزين' : 'Storage allowance'}</span>
                <span className="text-sm font-semibold text-on-surface-variant">
                  {storageGb != null ? `${storageGb} GB` : (isAr ? 'غير محدود' : 'Unlimited')}
                </span>
              </div>
              <p className="text-xs text-on-surface-variant mt-1">
                {isAr
                  ? 'يُعرض للمعلومات فقط — لا يتم فرضه على الرفع حالياً.'
                  : 'Shown for reference — not enforced at upload today.'}
              </p>
            </div>
          </div>

          {!tier && (
            <p className="text-xs text-on-surface-variant mt-4">
              {isAr
                ? 'لا توجد خطة محددة لمؤسستك، لذا لا يتم فرض أي حدود.'
                : 'No plan tier is set for your organisation, so no limits are enforced.'}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
