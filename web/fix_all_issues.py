import os

# ── 1. Fix PM Schedules - New button still English ──
with open('src/app/dashboard/pm-schedules/page.tsx', 'r', encoding='utf-8') as f:
    pm = f.read()

# Find exact button text
import re
matches = re.findall(r'>[^<]*New PM Schedule[^<]*<', pm)
print('PM button matches:', matches)

pm = re.sub(r'>New PM Schedule \+<', ">{t('pm.new')}<", pm)
pm = re.sub(r'>New PM Schedule\+<', ">{t('pm.new')}<", pm)
pm = re.sub(r'New PM Schedule \+', "{t('pm.new')}", pm)

# Fix malformed subtitle
pm = pm.replace('schedules \xc3\x82\xc2\xb7', 'schedules ·')
pm = pm.replace('schedules Â·', 'schedules ·')
pm = re.sub(r'schedules [^\d{]*(\d+|\{[^}]+\}) active', 
            lambda m: m.group().replace('schedules', "{t('pm.title').toLowerCase()}").replace('active', "{t('common.active').toLowerCase()}"),
            pm)

# Make sure lang is available
if "const { t, lang }" not in pm and "const { t }" in pm:
    pm = pm.replace("const { t } = useLanguage()", "const { t, lang } = useLanguage()")

with open('src/app/dashboard/pm-schedules/page.tsx', 'w', encoding='utf-8') as f:
    f.write(pm)
print('PM page updated')

# ── 2. Fix Sites page - translate it ──
with open('src/app/dashboard/sites/page.tsx', 'r', encoding='utf-8') as f:
    sites = f.read()

if 'useLanguage' not in sites:
    sites = sites.replace(
        "import Link from 'next/link'",
        "import Link from 'next/link'\nimport { useLanguage } from '@/context/LanguageContext'"
    )
    sites = sites.replace(
        "  const supabase = createClient()",
        "  const supabase = createClient()\n  const { t, lang } = useLanguage()"
    )
elif "const { t, lang }" not in sites and "const { t }" in sites:
    sites = sites.replace("const { t } = useLanguage()", "const { t, lang } = useLanguage()")

site_fixes = [
    (">Sites<", ">{t('nav.sites')}<"),
    (">Add Site +<", ">{lang === 'ar' ? '+ إضافة موقع' : 'Add Site +'}<"),
    (">Add Site<", ">{lang === 'ar' ? '+ إضافة موقع' : 'Add Site'}<"),
    ("'Search by name, city, or address...'", "lang === 'ar' ? 'البحث بالاسم أو المدينة أو العنوان...' : 'Search by name, city, or address...'"),
    ("placeholder='Search by name, city, or address'", "placeholder={lang === 'ar' ? 'البحث...' : 'Search by name, city, or address'}"),
    (">Active<", ">{t('common.active')}<"),
    (">Inactive<", ">{t('common.inactive')}<"),
    (">Edit<", ">{t('common.edit')}<"),
    (">No sites yet<", ">{lang === 'ar' ? 'لا توجد مواقع بعد' : 'No sites yet'}<"),
    ("'Active'", "t('common.active')"),
    ("'Inactive'", "t('common.inactive')"),
]

changed = 0
for old, new in site_fixes:
    if old in sites:
        sites = sites.replace(old, new)
        changed += 1

with open('src/app/dashboard/sites/page.tsx', 'w', encoding='utf-8') as f:
    f.write(sites)
print(f'Sites page: {changed} fixes')

# ── 3. Fix Inventory new form ──
with open('src/app/dashboard/inventory/new/page.tsx', 'r', encoding='utf-8') as f:
    inv = f.read()

if "const { t, lang }" not in inv:
    if "const { t }" in inv:
        inv = inv.replace("const { t } = useLanguage()", "const { t, lang } = useLanguage()")
    elif 'useLanguage' not in inv:
        inv = inv.replace(
            "import { useRouter } from 'next/navigation'",
            "import { useRouter } from 'next/navigation'\nimport { useLanguage } from '@/context/LanguageContext'"
        )
        inv = inv.replace(
            "  const router = useRouter()",
            "  const router = useRouter()\n  const { t, lang } = useLanguage()"
        )

inv_fixes = [
    (">Add Inventory Item<", ">{lang === 'ar' ? 'إضافة عنصر مخزون' : 'Add Inventory Item'}<"),
    (">Back to Inventory<", ">{lang === 'ar' ? 'رجوع للمخزون' : 'Back to Inventory'}<"),
    (">* Item Name (English)<", ">{lang === 'ar' ? '* اسم العنصر' : '* Item Name (English)'}<"),
    (">Item Name (Arabic)<", ">{lang === 'ar' ? 'الاسم بالعربية' : 'Item Name (Arabic)'}<"),
    (">SKU / Part Number<", ">{lang === 'ar' ? 'رمز المنتج' : 'SKU / Part Number'}<"),
    (">Category<", ">{lang === 'ar' ? 'الفئة' : 'Category'}<"),
    (">* Unit<", ">{lang === 'ar' ? '* الوحدة' : '* Unit'}<"),
    (">* Current Stock<", ">{lang === 'ar' ? '* المخزون الحالي' : '* Current Stock'}<"),
    (">Minimum Stock Level<", ">{lang === 'ar' ? 'الحد الأدنى للمخزون' : 'Minimum Stock Level'}<"),
    (">Unit Cost (SAR)<", ">{lang === 'ar' ? 'تكلفة الوحدة (ريال)' : 'Unit Cost (SAR)'}<"),
    (">Storage Location<", ">{lang === 'ar' ? 'موقع التخزين' : 'Storage Location'}<"),
    (">Site<", ">{lang === 'ar' ? 'الموقع' : 'Site'}<"),
    (">Piece<", ">{lang === 'ar' ? 'قطعة' : 'Piece'}<"),
    (">Box<", ">{lang === 'ar' ? 'صندوق' : 'Box'}<"),
    (">Litre<", ">{lang === 'ar' ? 'لتر' : 'Litre'}<"),
    (">KG<", ">{lang === 'ar' ? 'كيلوجرام' : 'KG'}<"),
    (">Metre<", ">{lang === 'ar' ? 'متر' : 'Metre'}<"),
    (">Roll<", ">{lang === 'ar' ? 'لفة' : 'Roll'}<"),
    (">Set<", ">{lang === 'ar' ? 'مجموعة' : 'Set'}<"),
    (">Pair<", ">{lang === 'ar' ? 'زوج' : 'Pair'}<"),
    (">Select category<", ">{lang === 'ar' ? 'اختر الفئة' : 'Select category'}<"),
    (">Select site<", ">{lang === 'ar' ? 'اختر الموقع' : 'Select site'}<"),
]

changed2 = 0
for old, new in inv_fixes:
    if old in inv:
        inv = inv.replace(old, new)
        changed2 += 1

with open('src/app/dashboard/inventory/new/page.tsx', 'w', encoding='utf-8') as f:
    f.write(inv)
print(f'Inventory new form: {changed2} fixes')

# ── 4. Fix PM new form remaining English ──
with open('src/app/dashboard/pm-schedules/new/page.tsx', 'r', encoding='utf-8') as f:
    pm_new = f.read()

if "const { t, lang }" not in pm_new and "const { t }" in pm_new:
    pm_new = pm_new.replace("const { t } = useLanguage()", "const { t, lang } = useLanguage()")

pm_new_fixes = [
    (">* Schedule Title<", ">{lang === 'ar' ? '* عنوان الجدول' : '* Schedule Title'}<"),
    (">* Frequency<", ">{lang === 'ar' ? '* التكرار' : '* Frequency'}<"),
    (">* First Due Date<", ">{lang === 'ar' ? '* تاريخ الاستحقاق الأول' : '* First Due Date'}<"),
    (">Create PM Schedule<", ">{lang === 'ar' ? 'إنشاء جدول صيانة' : 'Create PM Schedule'}<"),
    (">Quick templates<", ">{lang === 'ar' ? 'قوالب سريعة' : 'Quick templates'}<"),
]

changed3 = 0
for old, new in pm_new_fixes:
    if old in pm_new:
        pm_new = pm_new.replace(old, new)
        changed3 += 1

with open('src/app/dashboard/pm-schedules/new/page.tsx', 'w', encoding='utf-8') as f:
    f.write(pm_new)
print(f'PM new form: {changed3} fixes')

# ── 5. Fix Inspections templates new page ──
with open('src/app/dashboard/inspections/templates/new/page.tsx', 'r', encoding='utf-8') as f:
    tmpl = f.read()

if "const { t, lang }" not in tmpl:
    if "const { t }" in tmpl:
        tmpl = tmpl.replace("const { t } = useLanguage()", "const { t, lang } = useLanguage()")
    elif 'useLanguage' not in tmpl:
        tmpl = tmpl.replace(
            "import { useRouter } from 'next/navigation'",
            "import { useRouter } from 'next/navigation'\nimport { useLanguage } from '@/context/LanguageContext'"
        )
        tmpl = tmpl.replace(
            "  const router = useRouter()",
            "  const router = useRouter()\n  const { t, lang } = useLanguage()"
        )

tmpl_fixes = [
    (">New Inspection Template<", ">{lang === 'ar' ? 'نموذج تفتيش جديد' : 'New Inspection Template'}<"),
    (">Back to Inspections<", ">{lang === 'ar' ? 'رجوع' : 'Back to Inspections'}<"),
    (">Template Name *<", ">{lang === 'ar' ? '* اسم النموذج' : 'Template Name *'}<"),
    (">Vertical<", ">{lang === 'ar' ? 'القطاع' : 'Vertical'}<"),
    (">General<", ">{lang === 'ar' ? 'عام' : 'General'}<"),
    (">School<", ">{lang === 'ar' ? 'مدرسة' : 'School'}<"),
    (">Retail<", ">{lang === 'ar' ? 'تجزئة' : 'Retail'}<"),
    (">Compound<", ">{lang === 'ar' ? 'مجمع' : 'Compound'}<"),
    (">Hotel<", ">{lang === 'ar' ? 'فندق' : 'Hotel'}<"),
    (">Checklist Items<", ">{lang === 'ar' ? 'عناصر القائمة' : 'Checklist Items'}<"),
    (">+ Add Item<", ">{lang === 'ar' ? '+ إضافة عنصر' : '+ Add Item'}<"),
    (">Save Template<", ">{lang === 'ar' ? 'حفظ النموذج' : 'Save Template'}<"),
    (">Pass / Fail<", ">{lang === 'ar' ? 'ناجح / فاشل' : 'Pass / Fail'}<"),
    (">Yes / No<", ">{lang === 'ar' ? 'نعم / لا' : 'Yes / No'}<"),
    (">Score (1-5)<", ">{lang === 'ar' ? 'تقييم (1-5)' : 'Score (1-5)'}<"),
    (">Free Text<", ">{lang === 'ar' ? 'نص حر' : 'Free Text'}<"),
    (">Photo Required<", ">{lang === 'ar' ? 'صورة مطلوبة' : 'Photo Required'}<"),
    (">Load a vertical-specific template<", ">{lang === 'ar' ? 'تحميل نموذج خاص بالقطاع' : 'Load a vertical-specific template'}<"),
    (">Required<", ">{lang === 'ar' ? 'مطلوب' : 'Required'}<"),
]

changed4 = 0
for old, new in tmpl_fixes:
    if old in tmpl:
        tmpl = tmpl.replace(old, new)
        changed4 += 1

with open('src/app/dashboard/inspections/templates/new/page.tsx', 'w', encoding='utf-8') as f:
    f.write(tmpl)
print(f'Inspection templates new: {changed4} fixes')

# ── 6. Fix slow loading - add loading timeout protection ──
# The slow loading is due to Supabase RLS blocking unauthenticated users
# Add a timeout to the dashboard and users pages
with open('src/app/dashboard/users/page.tsx', 'r', encoding='utf-8') as f:
    users = f.read()

# Check if loading state gets stuck
if "setTimeout" not in users:
    users = users.replace(
        "  async function fetchUsers() {\n    setLoading(true)",
        "  async function fetchUsers() {\n    setLoading(true)\n    const timeout = setTimeout(() => setLoading(false), 8000)"
    )
    users = users.replace(
        "    if (data) setUsers(data)\n    setLoading(false)",
        "    if (data) setUsers(data)\n    clearTimeout(timeout)\n    setLoading(false)"
    )
    with open('src/app/dashboard/users/page.tsx', 'w', encoding='utf-8') as f:
        f.write(users)
    print('Users page timeout added')

print('\nAll fixes complete')