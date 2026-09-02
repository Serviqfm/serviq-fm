// Requisition status chip styling + bilingual labels. Shared by the list and the
// detail page (two call sites — dedup, not abstraction). Colour vocabulary is
// lifted from purchase-orders/page.tsx so the two lists read the same.

export type ReqStatus =
  | 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'converted' | 'cancelled'

export const STATUS_CLS: Record<ReqStatus, string> = {
  draft: 'bg-outline-variant/20 text-on-surface-variant border border-outline-variant/30',
  pending_approval: 'bg-secondary/10 text-secondary border border-secondary/20',
  approved: 'bg-primary/10 text-primary border border-primary/20',
  rejected: 'bg-error/10 text-error border border-error/20',
  converted: 'bg-primary/10 text-primary border border-primary/20',
  cancelled: 'bg-outline-variant/20 text-on-surface-variant border border-outline-variant/30',
}

const LABELS: Record<ReqStatus, { en: string; ar: string }> = {
  draft: { en: 'Draft', ar: 'مسودة' },
  pending_approval: { en: 'Pending approval', ar: 'بانتظار الموافقة' },
  approved: { en: 'Approved', ar: 'تمت الموافقة' },
  rejected: { en: 'Rejected', ar: 'مرفوض' },
  converted: { en: 'Converted', ar: 'تم التحويل' },
  cancelled: { en: 'Cancelled', ar: 'ملغي' },
}

export function statusLabel(status: ReqStatus, isAr: boolean): string {
  const l = LABELS[status]
  if (!l) return status
  return isAr ? l.ar : l.en
}
