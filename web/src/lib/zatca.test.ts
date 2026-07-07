import { describe, it, expect } from 'vitest'
import { generateZATCAQRData, calcVAT } from './zatca'

// Parse a ZATCA TLV byte buffer back into a { tag: value } map.
// TLV = [tag byte][length byte][value bytes]. Length is a BYTE count.
function parseTLV(b64: string): Record<number, string> {
  const bytes = Buffer.from(b64, 'base64')
  const out: Record<number, string> = {}
  let i = 0
  while (i < bytes.length) {
    const tag = bytes[i]
    const len = bytes[i + 1]
    out[tag] = bytes.subarray(i + 2, i + 2 + len).toString('utf8')
    i += 2 + len
  }
  return out
}

describe('generateZATCAQRData', () => {
  it('encodes the 5 required ZATCA tags as TLV with 2-decimal amounts', () => {
    const tlv = parseTLV(
      generateZATCAQRData({
        sellerName: 'Serviq FM',
        vatNumber: '300000000000003',
        invoiceDate: '2026-07-07T10:00:00Z',
        totalWithVAT: 115,
        vatAmount: 15,
      })
    )
    expect(tlv[1]).toBe('Serviq FM')
    expect(tlv[2]).toBe('300000000000003')
    expect(tlv[3]).toBe('2026-07-07T10:00:00Z')
    expect(tlv[4]).toBe('115.00')
    expect(tlv[5]).toBe('15.00')
  })

  it('uses byte-length (not char-length) prefixes for multi-byte Arabic names', () => {
    // If the length prefix ever counts chars instead of bytes, TLV parsing
    // drifts and this Arabic seller name comes back corrupted.
    const tlv = parseTLV(
      generateZATCAQRData({
        sellerName: 'شركة الخدمات',
        vatNumber: '311111111111113',
        invoiceDate: '2026-01-01T00:00:00Z',
        totalWithVAT: 1000,
        vatAmount: 130.5,
      })
    )
    expect(tlv[1]).toBe('شركة الخدمات')
    expect(tlv[4]).toBe('1000.00')
    expect(tlv[5]).toBe('130.50')
  })
})

describe('calcVAT', () => {
  it('applies 15% KSA VAT', () => {
    expect(calcVAT(100)).toEqual({ vat: 15, total: 115 })
    expect(calcVAT(200)).toEqual({ vat: 30, total: 230 })
  })
})
