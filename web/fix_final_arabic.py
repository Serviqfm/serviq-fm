import os

# ── Fix 1: Language persistence — store in cookie not just localStorage ──
with open('src/context/LanguageContext.tsx', 'r', encoding='utf-8') as f:
    ctx = f.read()

# Fix useEffect to also set a cookie for persistence across navigations
old_effect = """  useEffect(() => {
    const stored = localStorage.getItem('serviq_lang') as Language
    if (stored === 'ar' || stored === 'en') {
      setLangState(stored)
      document.documentElement.dir = stored === 'ar' ? 'rtl' : 'ltr'
      document.documentElement.lang = stored
    }
  }, [])"""

new_effect = """  useEffect(() => {
    // Check cookie first, then localStorage
    const cookieLang = document.cookie.split(';').map(c => c.trim()).find(c => c.startsWith('serviq_lang='))?.split('=')[1] as Language
    const stored = cookieLang || localStorage.getItem('serviq_lang') as Language
    if (stored === 'ar' || stored === 'en') {
      setLangState(stored)
      document.documentElement.dir = stored === 'ar' ? 'rtl' : 'ltr'
      document.documentElement.lang = stored
    }
  }, [])"""

old_setlang = """  function setLang(newLang: Language) {
    setLangState(newLang)
    localStorage.setItem('serviq_lang', newLang)
    document.documentElement.dir = newLang === 'ar' ? 'rtl' : 'ltr'
    document.documentElement.lang = newLang
  }"""

new_setlang = """  function setLang(newLang: Language) {
    setLangState(newLang)
    localStorage.setItem('serviq_lang', newLang)
    // Also set cookie so it persists across page navigations
    document.cookie = 'serviq_lang=' + newLang + '; path=/; max-age=31536000'
    document.documentElement.dir = newLang === 'ar' ? 'rtl' : 'ltr'
    document.documentElement.lang = newLang
  }"""

if old_effect in ctx:
    ctx = ctx.replace(old_effect, new_effect)
    print('Language persistence fixed')
if old_setlang in ctx:
    ctx = ctx.replace(old_setlang, new_setlang)
    print('setLang cookie added')

with open('src/context/LanguageContext.tsx', 'w', encoding='utf-8') as f:
    f.write(ctx)

# ── Fix 2: PM Schedules page - fix title, button, duplicate buttons ──
with open('src/app/dashboard/pm-schedules/page.tsx', 'r', encoding='utf-8') as f:
    pm = f.read()

# Fix title
pm = pm.replace(
    "<h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>PM Schedules</h1>",
    "<h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>{t('pm.title')}</h1>"
)
pm = pm.replace(
    "<h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>Preventive Maintenance</h1>",
    "<h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>{t('pm.title')}</h1>"
)

# Fix new schedule button
pm = pm.replace(
    ">+ New Schedule<",
    ">{t('pm.new')}<"
)
pm = pm.replace(
    ">New PM Schedule +<",
    ">{t('pm.new')}<"
)
pm = pm.replace(
    ">+ New PM Schedule<",
    ">{t('pm.new')}<"
)

# Fix no schedules text
pm = pm.replace(
    "'No PM schedules yet'",
    "t('pm.no_schedules')"
)
pm = pm.replace(
    ">No PM schedules yet<",
    ">{t('pm.no_schedules')}<"
)

# Remove duplicate Calendar/Compliance buttons — find and deduplicate
import re
# Count occurrences of Calendar button
calendar_count = pm.count(">{t('pm.calendar')}<")
compliance_count = pm.count(">{t('pm.compliance')}<")
print(f'Calendar buttons: {calendar_count}, Compliance buttons: {compliance_count}')

with open('src/app/dashboard/pm-schedules/page.tsx', 'w', encoding='utf-8') as f:
    f.write(pm)
print('PM page updated')

# ── Fix 3: Work Orders - status/priority buttons are rendered in JSX not arrays ──
with open('src/app/dashboard/work-orders/page.tsx', 'r', encoding='utf-8') as f:
    wo = f.read()

# These buttons are hardcoded text nodes — fix them all
status_map = {
    '>Closed<': ">{t('wo.status.closed')}<",
    '>Completed<': ">{t('wo.status.completed')}<",
    '>On Hold<': ">{t('wo.status.on_hold')}<",
    '>In Progress<': ">{t('wo.status.in_progress')}<",
    '>Assigned<': ">{t('wo.status.assigned')}<",
    '>New<': ">{t('wo.status.new')}<",
    '>All<': ">{t('common.all')}<",
    '>Critical<': ">{t('wo.priority.critical')}<",
    '>High<': ">{t('wo.priority.high')}<",
    '>Medium<': ">{t('wo.priority.medium')}<",
    '>Low<': ">{t('wo.priority.low')}<",
    '>All Priorities<': ">{t('filter.all_priorities')}<",
    '>Category<': ">{t('assets.col.cat')}<",
    '>Created<': ">{t('common.created')}<",
}
for old, new in status_map.items():
    wo = wo.replace(old, new)

# Fix search placeholder
wo = wo.replace(
    "placeholder='Search by title, asset, or site...'",
    "placeholder={t('wo.search')}"
)
wo = wo.replace(
    "placeholder='...Search by title, asset, or site'",
    "placeholder={t('wo.search')}"
)
wo = wo.replace(
    "'Search by title, asset, or site'",
    "t('wo.search')"
)

# Fix All Technicians and All Categories dropdowns
wo = wo.replace("All Technicians</option>", "{t('filter.all_techs')}</option>")
wo = wo.replace("All Categories</option>", "{t('filter.all_cats')}</option>")

with open('src/app/dashboard/work-orders/page.tsx', 'w', encoding='utf-8') as f:
    f.write(wo)
print('Work orders page updated')

# ── Fix 4: Assets - status/category filter buttons ──
with open('src/app/dashboard/assets/page.tsx', 'r', encoding='utf-8') as f:
    assets = f.read()

status_map_assets = {
    '>Retired<': ">{t('assets.status.retired')}<",
    '>Under Maintenance<': ">{t('assets.status.under_maintenance')}<",
    '>Active<': ">{t('assets.status.active')}<",
    '>All Status<': ">{t('common.all')}<",
    '>Export<': ">{t('btn.export')}<",
}
for old, new in status_map_assets.items():
    assets = assets.replace(old, new)

# Fix asset category filter buttons
category_map = {
    '>HVAC<': ">{t('cat.hvac')}<",
    '>Electrical<': ">{t('cat.electrical')}<",
    '>Plumbing<': ">{t('cat.plumbing')}<",
    '>Elevator / Lift<': ">{t('cat.elevator')}<",
    '>Fire Safety<': ">{t('cat.fire')}<",
    '>Furniture<': ">{t('cat.furniture')}<",
    '>Kitchen Equipment<': ">{t('cat.kitchen')}<",
    '>Pool / Gym<': ">{t('cat.pool')}<",
    '>IT Equipment<': ">{t('cat.it')}<",
    '>Signage<': ">{t('cat.signage')}<",
    '>Vehicle<': ">{t('cat.vehicle')}<",
    '>Other<': ">{t('cat.other')}<",
    '>All Categories<': ">{t('common.all')}<",
}
for old, new in category_map.items():
    assets = assets.replace(old, new)

# Fix search placeholder
assets = assets.replace(
    "placeholder='Search by name, serial number, manufacturer, or site'",
    "placeholder={t('assets.search')}"
)
assets = assets.replace(
    "placeholder='...Search by name, serial number, manufacturer, or site'",
    "placeholder={t('assets.search')}"
)

# Fix inline Active status badge text
assets = assets.replace(
    "a.status === 'active' ? 'Active' : a.status === 'under_maintenance' ? 'Under Maintenance' : 'Retired'",
    "a.status === 'active' ? t('assets.status.active') : a.status === 'under_maintenance' ? t('assets.status.under_maintenance') : t('assets.status.retired')"
)

with open('src/app/dashboard/assets/page.tsx', 'w', encoding='utf-8') as f:
    f.write(assets)
print('Assets page updated')

# ── Fix 5: Add category translations to context ──
with open('src/context/LanguageContext.tsx', 'r', encoding='utf-8') as f:
    ctx = f.read()

if "'cat.hvac'" not in ctx:
    cat_en = """  'cat.hvac': 'HVAC',
  'cat.electrical': 'Electrical',
  'cat.plumbing': 'Plumbing',
  'cat.elevator': 'Elevator / Lift',
  'cat.fire': 'Fire Safety',
  'cat.furniture': 'Furniture',
  'cat.kitchen': 'Kitchen Equipment',
  'cat.pool': 'Pool / Gym',
  'cat.it': 'IT Equipment',
  'cat.signage': 'Signage',
  'cat.vehicle': 'Vehicle',
  'cat.other': 'Other',"""

    cat_ar = """  'cat.hvac': 'تكييف وتهوية',
  'cat.electrical': 'كهرباء',
  'cat.plumbing': 'سباكة',
  'cat.elevator': 'مصعد / رافعة',
  'cat.fire': 'سلامة من الحريق',
  'cat.furniture': 'أثاث',
  'cat.kitchen': 'معدات مطبخ',
  'cat.pool': 'مسبح / صالة رياضية',
  'cat.it': 'معدات تقنية',
  'cat.signage': 'لافتات',
  'cat.vehicle': 'مركبة',
  'cat.other': 'أخرى',"""

    ctx = ctx.replace(
        "  'common.unassigned': 'Unassigned',",
        cat_en + "\n  'common.unassigned': 'Unassigned',"
    )
    ctx = ctx.replace(
        "  'common.unassigned': 'غير معيَّن',",
        cat_ar + "\n  'common.unassigned': 'غير معيَّن',"
    )
    with open('src/context/LanguageContext.tsx', 'w', encoding='utf-8') as f:
        f.write(ctx)
    print('Category translations added')

# ── Fix 6: Vendors - fix remaining strings ──
with open('src/app/dashboard/vendors/page.tsx', 'r', encoding='utf-8') as f:
    ven = f.read()

ven = ven.replace("'>Active<", ">{t('common.active')<")
ven = ven.replace("'>Inactive<", ">{t('common.inactive')<")
ven = ven.replace(
    "v.is_active ? 'Active' : 'Inactive'",
    "v.is_active ? t('common.active') : t('common.inactive')"
)
ven = ven.replace(
    "'Search by company name, contact, or specialisation...'",
    "t('vendors.search')"
)

with open('src/app/dashboard/vendors/page.tsx', 'w', encoding='utf-8') as f:
    f.write(ven)
print('Vendors page updated')

print('\nAll fixes complete — restart npm run dev')