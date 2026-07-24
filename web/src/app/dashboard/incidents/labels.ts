// FM-27 incident log — shared enums, bilingual labels, badge styles.
// Local to the module (no shared i18n edits).

export const SEVERITIES = ['low', 'medium', 'high', 'critical'] as const
export const STATUSES = ['open', 'investigating', 'resolved', 'closed'] as const

export const sevLabel = (s: string, ar: boolean) => ({
  low: ar ? 'منخفض' : 'Low', medium: ar ? 'متوسط' : 'Medium',
  high: ar ? 'عالٍ' : 'High', critical: ar ? 'حرج' : 'Critical',
}[s] ?? s)

export const statusLabel = (s: string, ar: boolean) => ({
  open: ar ? 'مفتوح' : 'Open', investigating: ar ? 'قيد التحقيق' : 'Investigating',
  resolved: ar ? 'تم الحل' : 'Resolved', closed: ar ? 'مغلق' : 'Closed',
}[s] ?? s)

export const sevClass: Record<string, string> = {
  low: 'bg-surface-container-low text-on-surface-variant',
  medium: 'bg-blue-50 text-blue-700',
  high: 'bg-[#f57f17]/10 text-[#f57f17]',
  critical: 'bg-error/10 text-error',
}

export const statusClass: Record<string, string> = {
  open: 'bg-error/10 text-error',
  investigating: 'bg-[#f57f17]/10 text-[#f57f17]',
  resolved: 'bg-primary/10 text-primary',
  closed: 'bg-surface-container-low text-on-surface-variant',
}
