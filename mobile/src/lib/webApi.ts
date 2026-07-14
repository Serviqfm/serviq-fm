// mobile/src/lib/webApi.ts
//
// Lets the mobile app call the web app's server routes (e.g. the work-order
// close endpoint) using the current Supabase session.
//
// The web routes authenticate via `@supabase/ssr` `createServerClient`, which
// reads the session ONLY from the `sb-<ref>-auth-token` cookie — it does not
// inspect the `Authorization` header. So mobile must present that cookie,
// encoded exactly the way `@supabase/ssr` writes it: the cookie value is
// `base64-` + base64url(JSON.stringify(session)), chunked into `.0`/`.1`/...
// parts when it exceeds MAX_CHUNK_SIZE. See @supabase/ssr utils/base64url +
// utils/chunker (pinned to the format used by ssr 0.12).

import { supabase } from './supabase'

// Web app base URL. Apex redirects to www with a 308, which can drop a POST
// body, so target www directly. Matches the reset URL host in LoginScreen.
const WEB_BASE_URL = 'https://www.serviqfm.com'

// Supabase project ref (from the URL in ./supabase). The SSR auth cookie name
// is derived from this ref.
const SUPABASE_REF = 'cnpsplprnnabhrjjeqwp'
const AUTH_COOKIE_NAME = `sb-${SUPABASE_REF}-auth-token`

// Must match @supabase/ssr utils/chunker MAX_CHUNK_SIZE.
const MAX_CHUNK_SIZE = 3180
const BASE64_PREFIX = 'base64-'

const TO_BASE64URL =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'.split('')

// Ported from @supabase/ssr utils/base64url.stringToBase64URL — UTF-8 then
// base64url (no padding). RN has no reliable btoa, and this must byte-match
// what the server decodes.
function stringToBase64URL(str: string): string {
  const out: string[] = []
  let queue = 0
  let queuedBits = 0
  const emit = (byte: number) => {
    queue = (queue << 8) | byte
    queuedBits += 8
    while (queuedBits >= 6) {
      out.push(TO_BASE64URL[(queue >> (queuedBits - 6)) & 63])
      queuedBits -= 6
    }
  }
  for (let i = 0; i < str.length; i++) {
    let cp = str.charCodeAt(i)
    if (cp > 0xd7ff && cp <= 0xdbff) {
      const high = ((cp - 0xd800) * 0x400) & 0xffff
      const low = (str.charCodeAt(i + 1) - 0xdc00) & 0xffff
      cp = (low | high) + 0x10000
      i++
    }
    if (cp <= 0x7f) emit(cp)
    else if (cp <= 0x7ff) { emit(0xc0 | (cp >> 6)); emit(0x80 | (cp & 0x3f)) }
    else if (cp <= 0xffff) { emit(0xe0 | (cp >> 12)); emit(0x80 | ((cp >> 6) & 0x3f)); emit(0x80 | (cp & 0x3f)) }
    else { emit(0xf0 | (cp >> 18)); emit(0x80 | ((cp >> 12) & 0x3f)); emit(0x80 | ((cp >> 6) & 0x3f)); emit(0x80 | (cp & 0x3f)) }
  }
  if (queuedBits > 0) {
    out.push(TO_BASE64URL[(queue << (6 - queuedBits)) & 63])
  }
  return out.join('')
}

// Build the Cookie header value the SSR server client expects for this session.
function buildAuthCookieHeader(sessionJson: string): string {
  const value = BASE64_PREFIX + stringToBase64URL(sessionJson)
  if (value.length <= MAX_CHUNK_SIZE) {
    return `${AUTH_COOKIE_NAME}=${value}`
  }
  // Chunk into .0/.1/... exactly like @supabase/ssr createChunks. base64url is
  // ASCII so slicing on code-unit boundaries is byte-safe.
  const parts: string[] = []
  for (let i = 0, n = 0; i < value.length; i += MAX_CHUNK_SIZE, n++) {
    parts.push(`${AUTH_COOKIE_NAME}.${n}=${value.slice(i, i + MAX_CHUNK_SIZE)}`)
  }
  return parts.join('; ')
}

export type CloseStatus = 'completed' | 'closed'

export type CloseArgs = {
  workOrderId: string
  status: CloseStatus
  closeoutPhotoUrls?: string[]
  signoff?: string
  completionNotes?: string
}

// POST the work-order close/complete transition through the web server route,
// which enforces field config (required close-out photos), records the sign-off
// and writes the audit log + manager notification. Returns the server's error
// message on failure so the caller can surface it verbatim.
export async function closeWorkOrder(
  args: CloseArgs
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) {
    return { ok: false, error: 'Not signed in' }
  }

  let res: Response
  try {
    res = await fetch(`${WEB_BASE_URL}/api/work-orders/${args.workOrderId}/close`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: buildAuthCookieHeader(JSON.stringify(session)),
      },
      body: JSON.stringify({
        status: args.status,
        closeout_photo_urls: args.closeoutPhotoUrls ?? [],
        signoff: args.signoff,
        completion_notes: args.completionNotes,
      }),
    })
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Network error' }
  }

  if (res.ok) return { ok: true }
  let error = `Request failed (${res.status})`
  try {
    const body = await res.json()
    if (body?.error) error = body.error
  } catch {}
  return { ok: false, error }
}
