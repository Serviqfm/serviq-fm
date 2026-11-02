// W7-02 — the one outbound-HTTP helper every ERP connector uses. SERVER ONLY.
//
//   * 15s timeout per request (AbortController) — an ERP that hangs must not
//     pin a serverless function.
//   * redirect: 'manual' — a 3xx is a failure, so a vetted host can't bounce us
//     to an internal one (see ssrf.ts).
//   * Errors are ErpRequestError carrying a SAFE message: provider label, HTTP
//     status and a short provider-supplied reason. Never request headers, never
//     the request body (which for Odoo carries the API key).

export const ERP_TIMEOUT_MS = 15_000

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export class ErpRequestError extends Error {
  constructor(readonly safeMessage: string, readonly status?: number) {
    super(safeMessage)
    this.name = 'ErpRequestError'
  }
}

export function truncate(s: string, n = 200): string {
  const one = s.replace(/\s+/g, ' ').trim()
  return one.length > n ? one.slice(0, n - 1) + '…' : one
}

/** Replace every occurrence of any secret (and its base64 form) with ***. */
export function redact(message: string, secrets: (string | undefined | null)[]): string {
  let out = message
  for (const s of secrets) {
    if (!s || s.length < 4) continue
    for (const form of [s, Buffer.from(s, 'utf8').toString('base64'), encodeURIComponent(s)]) {
      out = out.split(form).join('***')
    }
  }
  return out
}

/** Best-effort short reason from the common provider error shapes. */
export function providerReason(body: unknown): string {
  if (typeof body === 'string') return truncate(body.replace(/<[^>]*>/g, ' '))
  if (!body || typeof body !== 'object') return ''
  const b = body as Record<string, unknown>
  const err = b.error
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>
    if (typeof e.message === 'string') return truncate(e.message) // Business Central / OData
  }
  if (typeof err === 'string') {
    // OAuth token endpoints: { error: 'invalid_client', error_description: 'AADSTS…' }
    const d = typeof b.error_description === 'string' ? `: ${b.error_description.split(/\r?\n/)[0]}` : ''
    return truncate(err + d)
  }
  for (const k of ['detail', 'title', 'message']) if (typeof b[k] === 'string') return truncate(b[k] as string)
  return ''
}

export async function requestJson(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit,
  opts: { label: string; timeoutMs?: number },
): Promise<{ status: number; body: unknown }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? ERP_TIMEOUT_MS)
  let res: Response
  try {
    res = await fetchImpl(url, { ...init, redirect: 'manual', signal: controller.signal })
  } catch (e) {
    clearTimeout(timer)
    if (controller.signal.aborted || (e as Error)?.name === 'AbortError') {
      throw new ErpRequestError(`${opts.label}: timed out after ${Math.round((opts.timeoutMs ?? ERP_TIMEOUT_MS) / 1000)}s`)
    }
    throw new ErpRequestError(`${opts.label}: could not reach the server`)
  }
  let text = ''
  try { text = await res.text() } catch { text = '' } finally { clearTimeout(timer) }
  let body: unknown = text
  if (text) { try { body = JSON.parse(text) } catch { body = text } }

  if (res.status >= 300 && res.status < 400) {
    throw new ErpRequestError(`${opts.label}: unexpected redirect (HTTP ${res.status})`, res.status)
  }
  if (!res.ok) {
    const reason = providerReason(body)
    const hint = res.status === 401 || res.status === 403 ? ' — check the credentials' : ''
    throw new ErpRequestError(`${opts.label}: HTTP ${res.status}${hint}${reason ? ` — ${reason}` : ''}`, res.status)
  }
  return { status: res.status, body }
}
