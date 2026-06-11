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
