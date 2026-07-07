import { describe, it, expect } from 'vitest'
import { generateTempPassword } from './tempPassword'

describe('generateTempPassword', () => {
  it('is long and includes a digit and a symbol (policy-safe)', () => {
    const p = generateTempPassword()
    expect(p.length).toBeGreaterThanOrEqual(20) // 24 base64url chars + '!7'
    expect(p).toMatch(/[0-9]/)
    expect(p).toMatch(/[^A-Za-z0-9]/)
  })

  it('is unique across many calls (CSPRNG, not a fixed/seeded source)', () => {
    const set = new Set(Array.from({ length: 200 }, () => generateTempPassword()))
    expect(set.size).toBe(200)
  })
})
