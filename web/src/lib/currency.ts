// web/src/lib/currency.ts

export function formatSAR(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return 'SAR 0.00'
  const sar = cents / 100
  return new Intl.NumberFormat('en', {
    style: 'currency',
    currency: 'SAR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(sar)
}

export function parseSARToCents(input: string): number {
  const cleaned = input.replace(/[^0-9.]/g, '')
  const parsed = parseFloat(cleaned)
  if (Number.isNaN(parsed)) return 0
  return Math.round(parsed * 100)
}
