// W7-02 — at-rest encryption for ERP credentials. SERVER ONLY.
//
// AES-256-GCM with a 32-byte key from ERP_ENCRYPTION_KEY (base64 or 64 hex
// chars; generate with `openssl rand -base64 32`). Env-gated like lib/stripe.ts:
// with the key unset getErpEncryptionKey() returns null and the routes answer a
// clean 501 instead of storing anything in the clear.
//
// The AAD binds a ciphertext to its organisation + provider, so a row copied onto
// another org (or relabelled to another provider) fails authentication instead of
// decrypting. Never log the key, the plaintext, or the decrypted object.

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const VERSION = 'v1'

export function getErpEncryptionKey(env: Record<string, string | undefined> = process.env): Buffer | null {
  const raw = env.ERP_ENCRYPTION_KEY?.trim()
  if (!raw) return null
  let key: Buffer
  if (/^[0-9a-fA-F]{64}$/.test(raw)) key = Buffer.from(raw, 'hex')
  else key = Buffer.from(raw, 'base64')
  return key.length === 32 ? key : null
}

export function credentialAad(orgId: string, provider: string): string {
  return `serviq-erp:${orgId}:${provider}`
}

export function encryptSecrets(secrets: Record<string, string>, key: Buffer, aad: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(Buffer.from(aad, 'utf8'))
  const ct = Buffer.concat([cipher.update(JSON.stringify(secrets), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [VERSION, iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join('.')
}

/** Throws on a wrong key, wrong AAD or any tampering (GCM auth failure). */
export function decryptSecrets(blob: string, key: Buffer, aad: string): Record<string, string> {
  const parts = blob.split('.')
  if (parts.length !== 4 || parts[0] !== VERSION) throw new Error('Unrecognised credential format')
  const [, ivB64, tagB64, ctB64] = parts
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'))
  decipher.setAAD(Buffer.from(aad, 'utf8'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  const pt = Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString('utf8')
  const obj = JSON.parse(pt) as unknown
  if (!obj || typeof obj !== 'object') throw new Error('Unrecognised credential format')
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) if (typeof v === 'string') out[k] = v
  return out
}

/**
 * What the settings page may see about a secret: that it is set, and its last
 * four characters only when it is long enough that four chars reveal little.
 */
export function secretHint(value: string): { configured: true; last4: string | null } {
  return { configured: true, last4: value.length >= 12 ? value.slice(-4) : null }
}
