import { describe, it, expect } from 'vitest'
import { formatHijri } from './hijri'

describe('formatHijri — Gregorian → Umm al-Qura Hijri', () => {
  it('formats a known date into the expected Hijri year', () => {
    // 2026-07-24 falls in 1448 AH (Umm al-Qura).
    const out = formatHijri('2026-07-24T00:00:00Z', false)
    expect(out).toMatch(/1448/)
    expect(out).toMatch(/[A-Za-z]/) // Latin month name
  })

  it('uses Arabic-Indic numerals / month names when ar=true', () => {
    const out = formatHijri('2026-07-24T00:00:00Z', true)
    expect(out).toMatch(/[٠-٩]/) // Arabic-Indic digits
  })

  it('returns an em dash for an invalid date', () => {
    expect(formatHijri('not-a-date')).toBe('—')
  })
})
