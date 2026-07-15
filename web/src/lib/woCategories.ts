// WO-04 — Org-managed work-order categories with a hardcoded fallback.
// The category dropdowns read from work_order_categories (org-scoped RLS) and fall
// back to these defaults when the table is empty or absent (pre-migration), so
// nothing breaks before the b2-wo-categories.sql migration is applied.
import type { SupabaseClient } from '@supabase/supabase-js'

export type WoCategory = { name: string; name_ar: string | null }

// Mirrors the previously-hardcoded 12-category dropdown list.
export const DEFAULT_WO_CATEGORIES: WoCategory[] = [
  { name: 'HVAC',              name_ar: 'تكييف' },
  { name: 'Electrical',       name_ar: 'كهرباء' },
  { name: 'Plumbing',         name_ar: 'سباكة' },
  { name: 'Elevator / Lift',  name_ar: 'مصعد' },
  { name: 'Fire Safety',      name_ar: 'السلامة من الحريق' },
  { name: 'Furniture',        name_ar: 'أثاث' },
  { name: 'Kitchen Equipment',name_ar: 'معدات المطبخ' },
  { name: 'Pool / Gym',       name_ar: 'مسبح / صالة رياضية' },
  { name: 'IT Equipment',     name_ar: 'معدات تقنية' },
  { name: 'Signage',          name_ar: 'لافتات' },
  { name: 'Vehicle',          name_ar: 'مركبة' },
  { name: 'Other',            name_ar: 'أخرى' },
]

// Fetch active categories for the caller's org. Returns the hardcoded defaults if
// the table is empty or missing (pre-migration / query error).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchWoCategories(supabase: SupabaseClient<any>): Promise<WoCategory[]> {
  try {
    const { data, error } = await supabase
      .from('work_order_categories')
      .select('name, name_ar')
      .eq('is_active', true)
      .order('sort_order')
    if (error || !data || data.length === 0) return DEFAULT_WO_CATEGORIES
    return data as WoCategory[]
  } catch {
    return DEFAULT_WO_CATEGORIES
  }
}

export function catLabel(c: WoCategory, lang: string): string {
  return lang === 'ar' && c.name_ar ? c.name_ar : c.name
}
