/**
 * ZATCA Phase 2 TLV QR Code encoder
 * Tags: 1=seller, 2=vat_number, 3=timestamp, 4=total_with_vat, 5=vat_amount
 */
function encodeTLV(tag: number, value: string): Uint8Array {
  const valueBytes = new TextEncoder().encode(value)
  const result = new Uint8Array(2 + valueBytes.length)
  result[0] = tag
  result[1] = valueBytes.length
  result.set(valueBytes, 2)
  return result
}

export function generateZATCAQRData(params: {
  sellerName: string
  vatNumber: string
  invoiceDate: string // ISO string
  totalWithVAT: number
  vatAmount: number
}): string {
  const { sellerName, vatNumber, invoiceDate, totalWithVAT, vatAmount } = params

  const tlv1 = encodeTLV(1, sellerName)
  const tlv2 = encodeTLV(2, vatNumber)
  const tlv3 = encodeTLV(3, invoiceDate)
  const tlv4 = encodeTLV(4, totalWithVAT.toFixed(2))
  const tlv5 = encodeTLV(5, vatAmount.toFixed(2))

  const combined = new Uint8Array(
    tlv1.length + tlv2.length + tlv3.length + tlv4.length + tlv5.length
  )
  let offset = 0
  for (const buf of [tlv1, tlv2, tlv3, tlv4, tlv5]) {
    combined.set(buf, offset)
    offset += buf.length
  }

  return Buffer.from(combined).toString('base64')
}

export function formatSAR(amount: number): string {
  return 'SAR ' + amount.toLocaleString('en-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function calcVAT(amountExclVAT: number): { vat: number; total: number } {
  const vat = amountExclVAT * 0.15
  return { vat, total: amountExclVAT + vat }
}
