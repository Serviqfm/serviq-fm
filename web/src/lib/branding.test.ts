import { describe, it, expect } from 'vitest'
import { isHexColor, isSafeLogoUrl, resolveBranding } from './branding'

describe('isHexColor — CSS-injection guard', () => {
  it('accepts strict #rrggbb only', () => {
    expect(isHexColor('#1E2D4E')).toBe(true)
    expect(isHexColor('#abcdef')).toBe(true)
  })
  it('rejects short/long/non-hex and injection payloads', () => {
    expect(isHexColor('#fff')).toBe(false)
    expect(isHexColor('#12345g')).toBe(false)
    expect(isHexColor('red')).toBe(false)
    expect(isHexColor('#000; background:url(x)')).toBe(false)
    expect(isHexColor(null)).toBe(false)
    expect(isHexColor(undefined)).toBe(false)
  })
})

describe('isSafeLogoUrl — SSRF guard', () => {
  it('rejects non-https and garbage', () => {
    expect(isSafeLogoUrl('http://x/y.png')).toBe(false)
    expect(isSafeLogoUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeLogoUrl('not a url')).toBe(false)
    expect(isSafeLogoUrl('')).toBe(false)
  })
  // These two cases CONTROL the env var explicitly rather than inheriting it.
  // CI sets NEXT_PUBLIC_SUPABASE_URL for the test step, so a test that assumed
  // it was absent passed locally and failed in CI.
  it('accepts an https url when no supabase origin is configured', () => {
    const prev = process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    try {
      expect(isSafeLogoUrl('https://example.com/logo.png')).toBe(true)
    } finally {
      if (prev !== undefined) process.env.NEXT_PUBLIC_SUPABASE_URL = prev
    }
  })
  it('restricts to the storage origin when one IS configured', () => {
    const prev = process.env.NEXT_PUBLIC_SUPABASE_URL
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://dummy.supabase.co'
    try {
      expect(isSafeLogoUrl('https://dummy.supabase.co/storage/v1/object/public/media/l.png')).toBe(true)
      expect(isSafeLogoUrl('https://example.com/logo.png')).toBe(false)
    } finally {
      if (prev === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
      else process.env.NEXT_PUBLIC_SUPABASE_URL = prev
    }
  })
})

describe('resolveBranding — feature gate + fail-safe', () => {
  const valid = { brand_logo_url: 'https://x/l.png', brand_primary_color: '#111111', brand_secondary_color: '#222222' }
  it('returns null when the flag is off', () => {
    expect(resolveBranding(valid, false)).toBeNull()
  })
  it('returns null when nothing is set', () => {
    expect(resolveBranding({}, true)).toBeNull()
  })
  it('drops invalid colours but keeps valid ones', () => {
    const r = resolveBranding({ brand_primary_color: '#abcabc', brand_secondary_color: 'evil;' }, true)
    expect(r?.primary).toBe('#abcabc')
    expect(r?.secondary).toBeNull()
  })
})
