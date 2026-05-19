// web/src/lib/featureFlags.ts
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

export type TenantFlags = {
  advanced_reporting: boolean
  api_access: boolean
  invoicing: boolean
  multi_site: boolean
  custom_branding: boolean
}

const DEFAULT_FLAGS: TenantFlags = {
  advanced_reporting: false,
  api_access: false,
  invoicing: true,
  multi_site: true,
  custom_branding: false,
}

let _cached: { orgId: string; flags: TenantFlags; ts: number } | null = null
const TTL_MS = 5 * 60 * 1000

export function useFeatureFlag(): {
  flags: TenantFlags
  loading: boolean
  isEnabled: (key: keyof TenantFlags) => boolean
} {
  const [flags, setFlags] = useState<TenantFlags | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { if (!cancelled) setFlags(DEFAULT_FLAGS); return }
      const { data: profile } = await supabase
        .from('users')
        .select('organisation_id')
        .eq('id', user.id)
        .single()
      if (!profile?.organisation_id) { if (!cancelled) setFlags(DEFAULT_FLAGS); return }
      const orgId = profile.organisation_id
      if (_cached && _cached.orgId === orgId && Date.now() - _cached.ts < TTL_MS) {
        if (!cancelled) setFlags(_cached.flags)
        return
      }
      const { data: row } = await supabase
        .from('tenant_feature_flags')
        .select('advanced_reporting, api_access, invoicing, multi_site, custom_branding')
        .eq('organisation_id', orgId)
        .single()
      const flagsResolved = (row as TenantFlags | null) ?? DEFAULT_FLAGS
      _cached = { orgId, flags: flagsResolved, ts: Date.now() }
      if (!cancelled) setFlags(flagsResolved)
    })()
    return () => { cancelled = true }
  }, [])

  return {
    flags: flags ?? DEFAULT_FLAGS,
    loading: flags === null,
    isEnabled: (key) => (flags ?? DEFAULT_FLAGS)[key],
  }
}
