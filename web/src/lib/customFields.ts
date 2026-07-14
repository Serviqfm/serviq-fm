// web/src/lib/customFields.ts
//
// WO-26: org-defined custom fields on work orders. Definitions live in the
// custom_field_definitions table (org-scoped RLS); values live in the
// work_orders.custom_fields JSONB map keyed by definition.key.

export type CustomFieldType = 'text' | 'textarea' | 'number' | 'date' | 'dropdown'

export type CustomFieldDefinition = {
  id: string
  organisation_id: string
  entity: 'work_order'
  key: string
  label: string
  label_ar: string | null
  type: CustomFieldType
  options: string[]
  sort_order: number
  is_active: boolean
}

export const CUSTOM_FIELD_TYPES: CustomFieldType[] = ['text', 'textarea', 'number', 'date', 'dropdown']

export const CUSTOM_FIELD_TYPE_LABELS: Record<CustomFieldType, { en: string; ar: string }> = {
  text:     { en: 'Text',      ar: 'نص' },
  textarea: { en: 'Multiline', ar: 'نص متعدد الأسطر' },
  number:   { en: 'Number',    ar: 'رقم' },
  date:     { en: 'Date',      ar: 'تاريخ' },
  dropdown: { en: 'Dropdown',  ar: 'قائمة منسدلة' },
}

// A slug key derived from a label — stable JSONB map key, safe as an HTML id.
export function slugifyKey(label: string): string {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40)
}

export function fieldLabel(def: CustomFieldDefinition, lang: string): string {
  return lang === 'ar' && def.label_ar ? def.label_ar : def.label
}
