// web/src/lib/useCustomRole.ts
// W6-11 — the signed-in user's custom-role overlay, for nav/page SHOW-HIDE ONLY.
// This is cosmetic: every capability that actually matters is re-checked
// server-side by resolveCaller(allowedRoles, capability). Mirrors useFeatureFlag.
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { capabilityAllowed, type Capability, type CapabilityMap } from '@/lib/customRoles'

export function useCustomRole(): {
  permissions: CapabilityMap
  loading: boolean
  can: (cap: Capability) => boolean
} {
  const [permissions, setPermissions] = useState<CapabilityMap | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const done = (p: CapabilityMap) => { if (!cancelled) setPermissions(p) }
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return done({})
        const { data: profile } = await supabase
          .from('users').select('custom_role_id').eq('id', user.id).maybeSingle()
        const roleId = profile?.custom_role_id
        if (!roleId) return done({})
        const { data: role } = await supabase
          .from('custom_roles').select('permissions, is_active').eq('id', roleId).maybeSingle()
        done(!role || role.is_active === false ? {} : (role.permissions ?? {}))
      } catch {
        // Fail open — no overlay means the base role's normal UI. The server
        // still enforces; hiding a nav item is not a security control.
        done({})
      }
    })()
    return () => { cancelled = true }
  }, [])

  return {
    permissions: permissions ?? {},
    loading: permissions === null,
    can: (cap) => capabilityAllowed(permissions, cap),
  }
}
