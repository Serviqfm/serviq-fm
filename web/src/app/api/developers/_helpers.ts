// Admin-only auth + service-role client for the /dashboard/developers management routes
// (create/list/revoke API keys, register/list/delete webhooks). These are dashboard
// actions by a logged-in admin — distinct from the key-authenticated public /api/v1/*.

import { NextResponse } from 'next/server'
import { randomBytes, createHash } from 'crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export type AdminCtx = { userId: string; orgId: string; admin: SupabaseClient }

// Authenticates, requires role='admin', returns a service-role client. Org is taken
// from the caller's profile — never from the request body.
export async function resolveAdmin(): Promise<NextResponse | AdminCtx> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    return NextResponse.json({ error: 'Developer API is not configured on this deployment' }, { status: 501 })
  }

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile, error } = await supabase
    .from('users').select('organisation_id, role').eq('id', user.id).single()
  if (error) {
    console.error('[developers] profile lookup failed', error)
    return NextResponse.json({ error: 'Failed to load user profile' }, { status: 500 })
  }
  if (!profile?.organisation_id) return NextResponse.json({ error: 'No organisation' }, { status: 403 })
  if (profile.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  return { userId: user.id, orgId: profile.organisation_id, admin }
}

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex')
}

// Generates a fresh plaintext key (shown ONCE), plus its hash + display prefix.
export function generateApiKey(): { plaintext: string; hash: string; prefix: string } {
  const plaintext = 'sk_live_' + randomBytes(24).toString('hex') // 48 hex chars
  return { plaintext, hash: sha256Hex(plaintext), prefix: plaintext.slice(0, 8) }
}

// Generates an HMAC signing secret for a webhook endpoint.
export function generateWebhookSecret(): string {
  return 'whsec_' + randomBytes(24).toString('hex')
}

export const VALID_SCOPES = ['work-orders:read', 'assets:read'] as const
export const VALID_EVENTS = ['wo.created', 'wo.status_changed', 'request.submitted'] as const
