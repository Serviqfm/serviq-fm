import { NextResponse } from 'next/server'

// DV-10: best-effort in-memory token bucket keyed by client IP. Same approach as
// the /api/v1 per-key limiter (api/v1/_auth.ts) — no external dependency.
//
// ponytail: in-memory means PER-INSTANCE on serverless. Each warm lambda has its
// own bucket map, so the real ceiling is limit * (concurrent instances) and cold
// starts reset it. A shared store (Upstash/Redis) is the upgrade path if a hard
// global limit is ever needed; this still blunts single-source abuse loops.

type Bucket = { tokens: number; last: number }

// One map per (route) limiter instance so different routes don't share buckets.
export function makeIpRateLimiter(limitPerMin: number) {
  const buckets = new Map<string, Bucket>()

  // Accepts NextRequest or a plain Request (both expose headers.get).
  return function check(req: Request): NextResponse | null {
    const ip = clientIp(req)
    const now = Date.now()
    const b = buckets.get(ip) ?? { tokens: limitPerMin, last: now }
    b.tokens = Math.min(limitPerMin, b.tokens + ((now - b.last) / 60000) * limitPerMin)
    b.last = now
    if (b.tokens < 1) {
      buckets.set(ip, b)
      return NextResponse.json(
        { error: `Rate limit exceeded (${limitPerMin} requests/minute)` },
        { status: 429, headers: { 'Retry-After': '60' } },
      )
    }
    b.tokens -= 1
    buckets.set(ip, b)
    return null
  }
}

// x-forwarded-for is a comma list (client, proxy, ...); take the first hop.
// Falls back to a constant so a missing header shares one bucket rather than
// bypassing the limit entirely.
function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return req.headers.get('x-real-ip')?.trim() || 'unknown'
}
