// Category values must match the web app exactly
// (web/src/app/dashboard/work-orders/new/page.tsx and assets/new/page.tsx).
// The stored value is the English string; the label key is localized via i18n.
export const CATEGORIES: { value: string; labelKey: string }[] = [
  { value: 'HVAC', labelKey: 'cat_hvac' },
  { value: 'Electrical', labelKey: 'cat_electrical' },
  { value: 'Plumbing', labelKey: 'cat_plumbing' },
  { value: 'Elevator / Lift', labelKey: 'cat_elevator' },
  { value: 'Fire Safety', labelKey: 'cat_fire' },
  { value: 'Furniture', labelKey: 'cat_furniture' },
  { value: 'Kitchen Equipment', labelKey: 'cat_kitchen' },
  { value: 'Pool / Gym', labelKey: 'cat_pool' },
  { value: 'IT Equipment', labelKey: 'cat_it' },
  { value: 'Signage', labelKey: 'cat_signage' },
  { value: 'Vehicle', labelKey: 'cat_vehicle' },
  { value: 'Other', labelKey: 'cat_other' },
]

// FM-20: org-managed categories from work_order_categories (mirrors web's
// fetchWoCategories). Returns ready-to-use SelectField options, or null when the
// table is empty/missing/errors so the caller keeps the hardcoded CATEGORIES
// fallback (pre-migration / offline). The stored value stays the English name.
import { supabase } from './supabase'

export async function fetchOrgCategoryOptions(
  lang: string,
): Promise<{ value: string; label: string }[] | null> {
  try {
    const { data, error } = await supabase
      .from('work_order_categories')
      .select('name, name_ar')
      .eq('is_active', true)
      .order('sort_order')
    if (error || !data || data.length === 0) return null
    return data.map((c: { name: string; name_ar: string | null }) => ({
      value: c.name,
      label: lang === 'ar' && c.name_ar ? c.name_ar : c.name,
    }))
  } catch {
    return null
  }
}
