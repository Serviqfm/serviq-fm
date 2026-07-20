// Shared auth for the public REST API (/api/v1/*).
//
// SECURITY MODEL:
//   * Caller presents `Authorization: Bearer <plaintext-key>`.
//   * We SHA-256 the presented key and look up a NON-REVOKED api_keys row by hash,
//     using the SERVICE-ROLE client (bypasses RLS — this is an anon/keyed endpoint,
//     there is no auth.uid()). The org is resolved from that row, NEVER from the
//     request body/query. Bad or revoked key => 401.
//   * Scopes are enforced per-endpoint via requireScope().
//   * Env-gated: missing SUPABASE_SERVICE_ROLE_KEY yields a clean 501, never a crash,
//     so the app builds/boots with no external env vars set.

import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export type ApiKeyCtx = {
  orgId: string
  keyId: string
  scopes: string[]
  admin: SupabaseClient
}

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex')
}

// MKT-19: in-memory token bucket per api_key — ~60 req/min, refilled continuously.
// BEST-EFFORT on serverless: each warm lambda instance has its own bucket map, so
// the real ceiling is 60/min * (number of concurrent instances) and cold starts
// reset it. Good enough to stop a runaway loop; move to Upstash/Redis if a hard
// global limit is ever needed.
const RATE_LIMIT_PER_MIN = 60
const buckets = new Map<string, { tokens: number; last: number }>()

function takeToken(keyId: string): boolean {
  const now = Date.now()
  const b = buckets.get(keyId) ?? { tokens: RATE_LIMIT_PER_MIN, last: now }
  b.tokens = Math.min(RATE_LIMIT_PER_MIN, b.tokens + ((now - b.last) / 60000) * RATE_LIMIT_PER_MIN)
  b.last = now
  const ok = b.tokens >= 1
  if (ok) b.tokens -= 1
  buckets.set(keyId, b)
  return ok
}

// Resolves the API key from the request. Returns a NextResponse (error) OR a ctx.
export async function authenticateApiKey(req: NextRequest): Promise<NextResponse | ApiKeyCtx> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    return jsonError(501, 'not_configured', 'Public API is not configured on this deployment')
  }

  const header = req.headers.get('authorization') || ''
  const match = header.match(/^Bearer\s+(.+)$/i)
  const presented = match?.[1]?.trim()
  if (!presented) {
    return jsonError(401, 'unauthorized', 'Missing or malformed Authorization header')
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: row, error } = await admin
    .from('api_keys')
    .select('id, organisation_id, scopes, revoked_at')
    .eq('key_hash', sha256Hex(presented))
    .is('revoked_at', null)
    .maybeSingle()

  if (error) {
    console.error('[api/v1] key lookup failed', error)
    return jsonError(500, 'server_error', 'Key verification failed')
  }
  if (!row) {
    return jsonError(401, 'unauthorized', 'Invalid or revoked API key')
  }

  if (!takeToken(row.id as string)) {
    return NextResponse.json(
      { error: { code: 'rate_limited', message: `Rate limit exceeded (${RATE_LIMIT_PER_MIN} requests/minute per key)` } },
      { status: 429, headers: { 'Retry-After': '60' } },
    )
  }

  // Best-effort last-used stamp; never blocks the request.
  void admin.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', row.id).then(undefined, () => {})

  return {
    orgId: row.organisation_id as string,
    keyId: row.id as string,
    scopes: (row.scopes as string[]) ?? [],
    admin,
  }
}

// Enforces a scope on an already-authenticated ctx. Returns null if allowed,
// or a 403 NextResponse if the key lacks the scope.
export function requireScope(ctx: ApiKeyCtx, scope: string): NextResponse | null {
  if (ctx.scopes.includes(scope)) return null
  return jsonError(403, 'insufficient_scope', `This key is missing the '${scope}' scope`)
}

export function jsonError(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status })
}

// Clamps a ?limit= param to a sane page size.
export function parseLimit(req: NextRequest, def = 50, max = 200): number {
  const raw = req.nextUrl.searchParams.get('limit')
  const n = raw ? parseInt(raw, 10) : def
  if (!Number.isFinite(n) || n < 1) return def
  return Math.min(n, max)
}
