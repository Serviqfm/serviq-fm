import { describe, it, expect } from 'vitest'
import { sanitizeCell, parseCSV } from './csv'

describe('sanitizeCell — CSV formula-injection neutralization', () => {
  it('prefixes an apostrophe to formula-triggering leads', () => {
    expect(sanitizeCell('=1+1')).toBe("'=1+1")
    expect(sanitizeCell('+cmd')).toBe("'+cmd")
    expect(sanitizeCell('@SUM(A1)')).toBe("'@SUM(A1)")
    expect(sanitizeCell('-2+3+cmd|')).toBe("'-2+3+cmd|")
    expect(sanitizeCell('\ttab')).toBe("'\ttab")
  })

  it('leaves ordinary text and plain numbers untouched', () => {
    expect(sanitizeCell('Ahmed Al-Rashidi')).toBe('Ahmed Al-Rashidi')
    expect(sanitizeCell('ahmed@company.com')).toBe('ahmed@company.com') // @ is not the lead char
    expect(sanitizeCell('42')).toBe('42')
    expect(sanitizeCell('-3.5')).toBe('-3.5')
    expect(sanitizeCell('')).toBe('')
  })
})

describe('parseCSV', () => {
  it('maps header row to trimmed field objects', () => {
    const rows = parseCSV('email,role\n a@b.com , technician \n')
    expect(rows).toEqual([{ email: 'a@b.com', role: 'technician' }])
  })
})
