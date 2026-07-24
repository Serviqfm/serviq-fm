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
  it('accepts an https url when no supabase origin is configured', () => {
    // No NEXT_PUBLIC_SUPABASE_URL in the test env → https is sufficient.
    expect(isSafeLogoUrl('https://example.com/logo.png')).toBe(true)
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
