import { describe, it, expect, beforeAll } from 'vitest'
import {
  signImpersonationCookie,
  verifyImpersonationCookie,
  IMPERSONATION_TTL_MS,
  type ImpersonationPayload,
} from './impersonation'

// getSigningKey() needs a key source; set the dedicated env var so tests are
// self-contained (32-byte hex).
beforeAll(() => {
  process.env.IMPERSONATION_SIGNING_KEY = '00'.repeat(32)
})

const payload = (): ImpersonationPayload => ({
  platform_admin_id: 'admin-1',
  org_id: 'org-9',
  issued_at: Date.now(),
})

describe('verifyImpersonationCookie', () => {
  it('accepts a freshly signed token (round-trip)', () => {
    const token = signImpersonationCookie(payload())
    const result = verifyImpersonationCookie(token)
    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.platformAdminId).toBe('admin-1')
      expect(result.orgId).toBe('org-9')
    }
  })

  it('rejects a tampered signature', () => {
    const [body, sig] = signImpersonationCookie(payload()).split('.')
    const flipped = sig.slice(0, -1) + (sig.endsWith('A') ? 'B' : 'A')
    expect(verifyImpersonationCookie(`${body}.${flipped}`).valid).toBe(false)
  })

  it('rejects a tampered body', () => {
    const [body, sig] = signImpersonationCookie(payload()).split('.')
    const forged = Buffer.from(
      JSON.stringify({ ...payload(), org_id: 'org-evil' }),
      'utf-8',
    ).toString('base64url')
    // Same length class, but signature no longer matches the body.
    expect(body).not.toBe(forged)
    expect(verifyImpersonationCookie(`${forged}.${sig}`).valid).toBe(false)
  })

  it('rejects an expired token', () => {
    const stale = signImpersonationCookie({
      ...payload(),
      issued_at: Date.now() - IMPERSONATION_TTL_MS - 1000,
    })
    expect(verifyImpersonationCookie(stale).valid).toBe(false)
  })

  it('rejects malformed / missing tokens', () => {
    expect(verifyImpersonationCookie(null).valid).toBe(false)
    expect(verifyImpersonationCookie(undefined).valid).toBe(false)
    expect(verifyImpersonationCookie('nodot').valid).toBe(false)
  })
})
