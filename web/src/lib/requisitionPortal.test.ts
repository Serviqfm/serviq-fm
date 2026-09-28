import { describe, it, expect } from 'vitest'
import {
  emailDomainAllowed, normalizeDomain, parseDomainList,
  generateCode, hashCode, hashesMatch,
} from './requisitionPortal'

describe('emailDomainAllowed', () => {
  const domains = ['acme.com', 'acme.sa']

  it('admits an address on the list, whatever the casing', () => {
    expect(emailDomainAllowed('ali@acme.com', domains)).toBe(true)
    expect(emailDomainAllowed('  Ali@ACME.com ', domains)).toBe(true)
  })
  it('refuses a look-alike domain', () => {
    expect(emailDomainAllowed('ali@evil-acme.com', domains)).toBe(false)
    expect(emailDomainAllowed('ali@acme.com.attacker.net', domains)).toBe(false)
    expect(emailDomainAllowed('ali@notacme.com', domains)).toBe(false)
  })
  it('refuses a subdomain that was not listed', () => {
    expect(emailDomainAllowed('ali@mail.acme.com', domains)).toBe(false)
  })
  it('uses the LAST @ so a local part cannot smuggle a domain in', () => {
    expect(emailDomainAllowed('ali@acme.com@attacker.net', domains)).toBe(false)
  })
  it('refuses everything when nothing is configured', () => {
    expect(emailDomainAllowed('ali@acme.com', [])).toBe(false)
    expect(emailDomainAllowed('ali@acme.com', null)).toBe(false)
  })
  it('refuses malformed addresses', () => {
    expect(emailDomainAllowed('ali', domains)).toBe(false)
    expect(emailDomainAllowed('@acme.com', domains)).toBe(false)
    expect(emailDomainAllowed('ali@', domains)).toBe(false)
  })
})

describe('parseDomainList', () => {
  it('splits on commas, spaces and semicolons, strips @ and dedupes', () => {
    expect(parseDomainList('@Acme.com, acme.sa;  ACME.COM \n mail.acme.com'))
      .toEqual(['acme.com', 'acme.sa', 'mail.acme.com'])
  })
  it('is empty for empty input', () => {
    expect(parseDomainList('   ')).toEqual([])
  })
})

describe('normalizeDomain', () => {
  it('drops a leading @ and lower-cases', () => {
    expect(normalizeDomain(' @Acme.COM ')).toBe('acme.com')
  })
})

describe('code hashing', () => {
  it('generates six digits', () => {
    for (let i = 0; i < 50; i++) expect(generateCode()).toMatch(/^\d{6}$/)
  })
  it('salts by session, so the same code hashes differently', () => {
    expect(hashCode('123456', 'session-a')).not.toBe(hashCode('123456', 'session-b'))
  })
  it('matches only the same code in the same session', () => {
    const stored = hashCode('123456', 'session-a')
    expect(hashesMatch(hashCode('123456', 'session-a'), stored)).toBe(true)
    expect(hashesMatch(hashCode('123457', 'session-a'), stored)).toBe(false)
    expect(hashesMatch('short', stored)).toBe(false)
  })
})
