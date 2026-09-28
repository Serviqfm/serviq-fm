// P9 — the QR requisition portal's rules, kept pure so the gate that decides who
// may raise a requisition without an account is testable without a DB or a mailbox.
//
// The portal is open to anyone holding a site's QR, but a request only goes
// through after a code sent to an OFFICIAL address has been typed back. Two
// independent checks, neither sufficient alone:
//   1. the email's domain is on the organisation's allowlist;
//   2. the one-time code emailed to that address comes back within CODE_TTL_MIN.
// Holding the QR is not identity; owning the mailbox is.

import { createHash, randomInt } from 'crypto'

/** How long an emailed code stays usable. */
export const CODE_TTL_MIN = 10
/** How long a verified session may keep filling in the form. */
export const SESSION_TTL_MIN = 30
/** Wrong codes allowed per session before it is burned. */
export const MAX_ATTEMPTS = 5
/** Codes one address may request per hour, so the portal cannot be used to spam a mailbox. */
export const MAX_CODES_PER_HOUR = 5

/** Lower-cases and strips a leading @ so '@Acme.COM ' and 'acme.com' are one entry. */
export function normalizeDomain(raw: string): string {
  return raw.trim().replace(/^@/, '').toLowerCase()
}

export function parseDomainList(raw: string): string[] {
  return Array.from(new Set(raw.split(/[\s,;]+/).map(normalizeDomain).filter(Boolean)))
}

/**
 * Is this an official address for the organisation?
 *
 * Exact domain match only: 'acme.com' does NOT admit 'evil-acme.com' or
 * 'acme.com.attacker.net', and it does not admit subdomains either — an org that
 * wants mail.acme.com lists it. An empty allowlist admits nobody, which is what
 * keeps the portal closed until someone deliberately configures it.
 */
export function emailDomainAllowed(email: string, domains: string[] | null | undefined): boolean {
  const at = email.trim().toLowerCase().lastIndexOf('@')
  if (at <= 0 || at === email.trim().length - 1) return false
  const domain = email.trim().toLowerCase().slice(at + 1)
  return (domains ?? []).map(normalizeDomain).includes(domain)
}

/** A 6-digit code from a cryptographic source — never Math.random for a credential. */
export function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

/**
 * Codes are stored hashed: a leaked backup of requisition_portal_sessions must
 * not hand anyone a working code. Salted with the session id so the same code in
 * two rows does not produce the same hash.
 */
export function hashCode(code: string, sessionId: string): string {
  return createHash('sha256').update(`${sessionId}:${code}`).digest('hex')
}

/** Constant-time-ish compare of two hex digests of equal length. */
export function hashesMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
