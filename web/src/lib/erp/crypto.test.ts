import { describe, it, expect } from 'vitest'
import { randomBytes } from 'crypto'
import { credentialAad, decryptSecrets, encryptSecrets, getErpEncryptionKey, secretHint } from './crypto'

const KEY = randomBytes(32)

describe('ERP credential encryption (AES-256-GCM)', () => {
  it('round-trips and never stores the plaintext', () => {
    const secrets = { apiKey: 'odoo-key-0123456789abcd' }
    const aad = credentialAad('org-1', 'odoo')
    const blob = encryptSecrets(secrets, KEY, aad)
    expect(blob.startsWith('v1.')).toBe(true)
    expect(blob).not.toContain('odoo-key')
    expect(decryptSecrets(blob, KEY, aad)).toEqual(secrets)
  })

  it('uses a fresh IV per encryption', () => {
    const aad = credentialAad('org-1', 'odoo')
    expect(encryptSecrets({ a: 'b' }, KEY, aad)).not.toBe(encryptSecrets({ a: 'b' }, KEY, aad))
  })

  it('fails on a wrong key, another org/provider (AAD) or tampering', () => {
    const aad = credentialAad('org-1', 'oracle')
    const blob = encryptSecrets({ password: 'p' }, KEY, aad)
    expect(() => decryptSecrets(blob, randomBytes(32), aad)).toThrow()
    expect(() => decryptSecrets(blob, KEY, credentialAad('org-2', 'oracle'))).toThrow()
    expect(() => decryptSecrets(blob, KEY, credentialAad('org-1', 'odoo'))).toThrow()
    const parts = blob.split('.')
    const ct = Buffer.from(parts[3], 'base64'); ct[0] ^= 1
    expect(() => decryptSecrets([parts[0], parts[1], parts[2], ct.toString('base64')].join('.'), KEY, aad)).toThrow()
  })

  it('missing / malformed key → null (routes then answer 501)', () => {
    expect(getErpEncryptionKey({})).toBeNull()
    expect(getErpEncryptionKey({ ERP_ENCRYPTION_KEY: '' })).toBeNull()
    expect(getErpEncryptionKey({ ERP_ENCRYPTION_KEY: 'too-short' })).toBeNull()
    expect(getErpEncryptionKey({ ERP_ENCRYPTION_KEY: KEY.toString('base64') })?.equals(KEY)).toBe(true)
    expect(getErpEncryptionKey({ ERP_ENCRYPTION_KEY: KEY.toString('hex') })?.equals(KEY)).toBe(true)
  })

  it('hints reveal at most the last 4 chars, and nothing for short secrets', () => {
    expect(secretHint('abcdefghijkl1234')).toEqual({ configured: true, last4: '1234' })
    expect(secretHint('short')).toEqual({ configured: true, last4: null })
  })
})
