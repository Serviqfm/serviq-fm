// CORE-30 unit-handover — shared enums, bilingual labels, badge styles,
// and the default move-in/move-out checklist. Local to the module.

export const DIRECTIONS = ['move_in', 'move_out'] as const
export const STATUSES = ['draft', 'in_progress', 'completed'] as const

export type ChecklistItem = { item: string; ok: boolean; note: string }

export const dirLabel = (d: string, ar: boolean) => ({
  move_in: ar ? 'تسليم للساكن' : 'Move-in', move_out: ar ? 'استلام من الساكن' : 'Move-out',
}[d] ?? d)

export const statusLabel = (s: string, ar: boolean) => ({
  draft: ar ? 'مسودة' : 'Draft', in_progress: ar ? 'قيد التنفيذ' : 'In progress',
  completed: ar ? 'مكتمل' : 'Completed',
}[s] ?? s)

export const statusClass: Record<string, string> = {
  draft: 'bg-surface-container-low text-on-surface-variant',
  in_progress: 'bg-[#f57f17]/10 text-[#f57f17]',
  completed: 'bg-primary/10 text-primary',
}

// Seeded on create in the creator's UI language (checklist items are free text).
const DEFAULT_ITEMS_EN = [
  'Keys handed over', 'Access cards / fobs', 'Water meter reading recorded',
  'Electricity meter reading recorded', 'AC units tested', 'Plumbing & taps checked',
  'Lighting & switches working', 'Walls & paint condition', 'Appliances present & working',
  'Smoke / fire detectors present', 'Unit cleaned', 'Snag list attached',
]
const DEFAULT_ITEMS_AR = [
  'تسليم المفاتيح', 'بطاقات الدخول', 'تسجيل قراءة عداد المياه',
  'تسجيل قراءة عداد الكهرباء', 'فحص وحدات التكييف', 'فحص السباكة والصنابير',
  'الإضاءة والمفاتيح تعمل', 'حالة الجدران والدهان', 'الأجهزة موجودة وتعمل',
  'أجهزة إنذار الحريق موجودة', 'تنظيف الوحدة', 'قائمة الملاحظات مرفقة',
]

export const defaultChecklist = (ar: boolean): ChecklistItem[] =>
  (ar ? DEFAULT_ITEMS_AR : DEFAULT_ITEMS_EN).map(item => ({ item, ok: false, note: '' }))
