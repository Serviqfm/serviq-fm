import { randomBytes } from 'crypto'

// CSPRNG temporary password (DV-09). 18 random bytes -> 24 URL-safe base64 chars
// (~144 bits of entropy), plus a fixed symbol+digit so it also satisfies password
// policies that require a non-alphanumeric character. Server-only (Node crypto).
// Replaces the old `'Serviq' + Math.random()...` (~41 bits, not cryptographic).
export function generateTempPassword(): string {
  return randomBytes(18).toString('base64url') + '!7'
}
