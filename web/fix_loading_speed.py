# Create a cached auth helper to speed up all pages
content = """import { createClient } from '@/lib/supabase'

let cachedOrgId: string | null = null
let cachedUserId: string | null = null
let cacheTime: number = 0
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

export async function getOrgId(): Promise<{ orgId: string | null; userId: string | null }> {
  const now = Date.now()
  if (cachedOrgId && cachedUserId && (now - cacheTime) < CACHE_TTL) {
    return { orgId: cachedOrgId, userId: cachedUserId }
  }

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { orgId: null, userId: null }

  const { data: profile } = await supabase
    .from('users')
    .select('organisation_id')
    .eq('id', user.id)
    .single()

  if (!profile) return { orgId: null, userId: null }

  cachedOrgId = profile.organisation_id
  cachedUserId = user.id
  cacheTime = now

  return { orgId: profile.organisation_id, userId: user.id }
}

export function clearOrgCache() {
  cachedOrgId = null
  cachedUserId = null
  cacheTime = 0
}"""

import os
os.makedirs('src/lib', exist_ok=True)
with open('src/lib/auth-helper.ts', 'w', encoding='utf-8') as f:
    f.write(content)
print('Auth helper created')