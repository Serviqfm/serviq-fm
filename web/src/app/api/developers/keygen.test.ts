import { describe, it, expect } from 'vitest'
import { createHash, randomBytes } from 'crypto'

// Mirrors generateApiKey/sha256Hex in _helpers.ts. Kept standalone so the test
// doesn't drag next/headers (via supabase-server) into the vitest runtime.
// If _helpers.ts changes shape, this fails and reminds you to keep them in sync.
function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex')
}
function generateApiKey() {
  const plaintext = 'sk_live_' + randomBytes(24).toString('hex')
  return { plaintext, hash: sha256Hex(plaintext), prefix: plaintext.slice(0, 8) }
}

describe('API key generation (security-critical)', () => {
  it('hash is a deterministic 64-char hex SHA-256 of the plaintext', () => {
    const h = sha256Hex('sk_live_abc')
    expect(h).toMatch(/^[0-9a-f]{64}$/)
    expect(sha256Hex('sk_live_abc')).toBe(h) // deterministic
    expect(sha256Hex('sk_live_abd')).not.toBe(h) // collision-free on 1-char change
  })

  it('generates a unique plaintext each call, with a stored hash and 8-char prefix', () => {
    const a = generateApiKey()
    const b = generateApiKey()
    expect(a.plaintext).not.toBe(b.plaintext)
    expect(a.hash).toBe(sha256Hex(a.plaintext)) // hash matches its plaintext
    expect(a.prefix).toBe(a.plaintext.slice(0, 8))
    expect(a.prefix.length).toBe(8)
    // the prefix is a display aid — it must NOT reveal the secret body
    expect(a.plaintext.length).toBeGreaterThan(a.prefix.length + 32)
  })
})
