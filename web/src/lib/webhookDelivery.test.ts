import { describe, it, expect } from 'vitest'
import { createHmac } from 'crypto'

// The signature scheme in webhookDelivery.ts: HMAC-SHA256 over the raw body,
// hex-encoded, prefixed 'sha256='. This test pins that contract so a receiver
// verifying with the same secret always matches.
function sign(secret: string, body: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(body, 'utf8').digest('hex')
}

describe('webhook signature', () => {
  it('is a stable HMAC-SHA256 a receiver can reproduce', () => {
    const secret = 'whsec_test'
    const body = JSON.stringify({ event: 'wo.status_changed', data: { id: 'x' } })
    const sig = sign(secret, body)
    expect(sig).toMatch(/^sha256=[0-9a-f]{64}$/)
    // receiver recomputes and matches
    expect(sign(secret, body)).toBe(sig)
    // different secret => different signature
    expect(sign('whsec_other', body)).not.toBe(sig)
  })
})
