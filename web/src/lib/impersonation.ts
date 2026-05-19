// web/src/lib/impersonation.ts

import crypto from 'crypto'

export type ImpersonationPayload = {
  platform_admin_id: string
  org_id: string
  issued_at: number  // epoch ms
}

const TTL_MS = 4 * 60 * 60 * 1000  // 4 hours
const COOKIE_NAME = 'impersonating_org_id'

function getSigningKey(): Buffer {
  const key = process.env.IMPERSONATION_SIGNING_KEY
  if (!key) throw new Error('IMPERSONATION_SIGNING_KEY env var not set')
  return Buffer.from(key, 'hex')
}

export function signImpersonationCookie(payload: ImpersonationPayload): string {
  const body = JSON.stringify(payload)
  const bodyB64 = Buffer.from(body, 'utf-8').toString('base64url')
  const signature = crypto.createHmac('sha256', getSigningKey()).update(bodyB64).digest('base64url')
  return `${bodyB64}.${signature}`
}

export function verifyImpersonationCookie(token: string | undefined | null): {
  valid: true; platformAdminId: string; orgId: string
} | { valid: false } {
  if (!token || typeof token !== 'string') return { valid: false }
  const parts = token.split('.')
  if (parts.length !== 2) return { valid: false }
  const [bodyB64, signature] = parts
  const expected = crypto.createHmac('sha256', getSigningKey()).update(bodyB64).digest('base64url')
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return { valid: false }
  }
  let payload: ImpersonationPayload
  try {
    payload = JSON.parse(Buffer.from(bodyB64, 'base64url').toString('utf-8'))
  } catch {
    return { valid: false }
  }
  if (Date.now() - payload.issued_at > TTL_MS) return { valid: false }
  return { valid: true, platformAdminId: payload.platform_admin_id, orgId: payload.org_id }
}

export const IMPERSONATION_COOKIE_NAME = COOKIE_NAME
export const IMPERSONATION_TTL_MS = TTL_MS
