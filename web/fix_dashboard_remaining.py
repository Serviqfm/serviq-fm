with open('src/app/dashboard/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix section headings
replacements = [
    # Charts
    ("'Open WOs by Status'", "lang === 'ar' ? 'أوامر العمل المفتوحة حسب الحالة' : 'Open WOs by Status'"),
    ("'Open WOs by Priority'", "lang === 'ar' ? 'أوامر العمل المفتوحة حسب الأولوية' : 'Open WOs by Priority'"),
    # Section titles
    (">Upcoming PM Tasks<", ">{t('dashboard.upcoming_pm')}<"),
    (">Recent Activity<", ">{t('dashboard.recent_activity')}<"),
    (">View all<", ">{t('dashboard.view_all')}<"),
    # Bottom buttons
    (">+ New Work Order<", ">{t('dashboard.new_wo')}<"),
    (">+ Add Asset<", ">{t('dashboard.add_asset')}<"),
    (">+ New PM Schedule<", ">{t('dashboard.new_pm')}<"),
    (">PM Compliance<", ">{t('dashboard.pm_compliance_btn')}<"),
    (">New Work Order +<", ">{t('dashboard.new_wo')}<"),
    (">New PM Schedule +<", ">{t('dashboard.new_pm')}<"),
    (">Add Asset +<", ">{t('dashboard.add_asset')}<"),
    # Unassigned
    ("'Unassigned'", "t('common.unassigned')"),
    # Today/Tomorrow
    ("'Today'", "t('dashboard.today')"),
    ("'Tomorrow'", "t('dashboard.tomorrow')"),
    # Status in activity log
    ("log.action", "lang === 'ar' ? log.action.replace('assigned', 'مُعيَّن').replace('in_progress', 'قيد التنفيذ').replace('on_hold', 'معلق').replace('completed', 'مكتمل').replace('closed', 'مغلق').replace('Status changed to', 'تم تغيير الحالة إلى') : log.action"),
]

# Add lang to useLanguage hook
if "const { t } = useLanguage()" in content:
    content = content.replace(
        "const { t } = useLanguage()",
        "const { t, lang } = useLanguage()"
    )
    print('Added lang to useLanguage')

changed = 0
for old, new in replacements:
    if old in content:
        content = content.replace(old, new)
        changed += 1

print(f'Fixed {changed} items')

# Fix "In X days" / "Today" / "Tomorrow" for PM tasks
old_days = """                  {days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : 'In ' + days + ' days'}"""
new_days = """                  {days === 0 ? t('dashboard.today') : days === 1 ? t('dashboard.tomorrow') : (lang === 'ar' ? 'بعد ' + days + ' أيام' : 'In ' + days + ' days')}"""
if old_days in content:
    content = content.replace(old_days, new_days)
    print('Days text fixed')

with open('src/app/dashboard/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Dashboard page updated')

# ── Fix New Work Order form labels ──
with open('src/app/dashboard/work-orders/new/page.tsx', 'r', encoding='utf-8') as f:
    wo_new = f.read()

wo_replacements = [
    ("'New Work Order'", "t('wo.new')"),
    ("'Work Order Title *'", "t('wo.col.title') + ' *'"),
    ("'Title *'", "t('wo.col.title') + ' *'"),
    ("'Description'", "t('common.description')"),
    ("'Priority *'", "t('wo.col.priority') + ' *'"),
    ("'Category'", "t('assets.col.cat')"),
    ("'Site'", "t('common.site')"),
    ("'Asset'", "t('common.asset')"),
    ("'Due Date'", "t('common.due_date')"),
    ("'Assign To'", "t('common.assign')"),
    ("'SLA Hours'", "t('wo.sla')"),
    ("'Cancel'", "t('common.cancel')"),
    ("'Creating...'", "t('common.saving')"),
    ("'Create Work Order'", "t('wo.new')"),
    ("'Save Work Order'", "t('wo.new')"),
    ("'>Select priority<'", "t('common.select')"),
    ("'>Select site<'", "t('common.select')"),
    ("'>Select asset<'", "t('common.select')"),
    ("'>Assign to technician or vendor<'", "t('common.select')"),
    (">Low<", ">{t('wo.priority.low')}<"),
    (">Medium<", ">{t('wo.priority.medium')}<"),
    (">High<", ">{t('wo.priority.high')}<"),
    (">Critical<", ">{t('wo.priority.critical')}<"),
    (">New Work Order<", ">{t('wo.new')}<"),
    (">Back to Work Orders<", ">{t('common.back')}<"),
]

if 'useLanguage' not in wo_new:
    wo_new = wo_new.replace(
        "import { useRouter } from 'next/navigation'",
        "import { useRouter } from 'next/navigation'\nimport { useLanguage } from '@/context/LanguageContext'"
    )
    wo_new = wo_new.replace(
        "  const router = useRouter()",
        "  const router = useRouter()\n  const { t } = useLanguage()"
    )

changed2 = 0
for old, new in wo_replacements:
    if old in wo_new:
        wo_new = wo_new.replace(old, new)
        changed2 += 1

with open('src/app/dashboard/work-orders/new/page.tsx', 'w', encoding='utf-8') as f:
    f.write(wo_new)
print(f'WO new form: {changed2} fixes')

# ── Fix New Asset form ──
with open('src/app/dashboard/assets/new/page.tsx', 'r', encoding='utf-8') as f:
    asset_new = f.read()

asset_replacements = [
    ("'Add New Asset'", "t('assets.new')"),
    ("'Asset Name *'", "t('assets.col.name') + ' *'"),
    ("'Category'", "t('assets.col.cat')"),
    ("'Site'", "t('common.site')"),
    ("'Sub-location'", "lang === 'ar' ? 'الموقع الفرعي' : 'Sub-location'"),
    ("'Serial Number'", "lang === 'ar' ? 'الرقم التسلسلي' : 'Serial Number'"),
    ("'Manufacturer'", "lang === 'ar' ? 'الشركة المصنعة' : 'Manufacturer'"),
    ("'Model'", "lang === 'ar' ? 'الموديل' : 'Model'"),
    ("'Purchase Date'", "lang === 'ar' ? 'تاريخ الشراء' : 'Purchase Date'"),
    ("'Purchase Cost (SAR)'", "lang === 'ar' ? 'تكلفة الشراء (ريال)' : 'Purchase Cost (SAR)'"),
    ("'Warranty Expiry'", "lang === 'ar' ? 'انتهاء الضمان' : 'Warranty Expiry'"),
    ("'Expected Lifespan (years)'", "lang === 'ar' ? 'العمر الافتراضي (سنوات)' : 'Expected Lifespan (years)'"),
    ("'Description'", "t('common.description')"),
    ("'Location Notes'", "lang === 'ar' ? 'ملاحظات الموقع' : 'Location Notes'"),
    ("'Cancel'", "t('common.cancel')"),
    ("'Saving...'", "t('common.saving')"),
    ("'Save Asset'", "t('common.save')"),
    ("'Back to Assets'", "t('common.back')"),
]

if 'useLanguage' not in asset_new:
    asset_new = asset_new.replace(
        "import { useRouter } from 'next/navigation'",
        "import { useRouter } from 'next/navigation'\nimport { useLanguage } from '@/context/LanguageContext'"
    )
    asset_new = asset_new.replace(
        "  const router = useRouter()",
        "  const router = useRouter()\n  const { t, lang } = useLanguage()"
    )
elif "const { t }" in asset_new and "const { t, lang }" not in asset_new:
    asset_new = asset_new.replace("const { t } = useLanguage()", "const { t, lang } = useLanguage()")

changed3 = 0
for old, new in asset_replacements:
    if old in asset_new:
        asset_new = asset_new.replace(old, new)
        changed3 += 1

with open('src/app/dashboard/assets/new/page.tsx', 'w', encoding='utf-8') as f:
    f.write(asset_new)
print(f'Asset new form: {changed3} fixes')

# ── Fix New PM Schedule form ──
with open('src/app/dashboard/pm-schedules/new/page.tsx', 'r', encoding='utf-8') as f:
    pm_new = f.read()

pm_replacements = [
    ("'New PM Schedule'", "t('pm.new')"),
    ("'Title *'", "t('common.name') + ' *'"),
    ("'Description'", "t('common.description')"),
    ("'Frequency *'", "t('pm.col.freq') + ' *'"),
    ("'Asset'", "t('common.asset')"),
    ("'Site'", "t('common.site')"),
    ("'Assign To'", "t('common.assign')"),
    ("'Next Due Date'", "t('pm.col.due')"),
    ("'Duration (minutes)'", "lang === 'ar' ? 'المدة (دقائق)' : 'Duration (minutes)'"),
    ("'Seasonal schedule'", "lang === 'ar' ? 'جدول موسمي' : 'Seasonal schedule'"),
    ("'Cancel'", "t('common.cancel')"),
    ("'Saving...'", "t('common.saving')"),
    ("'Save Schedule'", "t('common.save')"),
    ("'Back to PM Schedules'", "t('common.back')"),
    (">Daily<", ">{lang === 'ar' ? 'يومي' : 'Daily'}<"),
    (">Weekly<", ">{lang === 'ar' ? 'أسبوعي' : 'Weekly'}<"),
    (">Fortnightly<", ">{lang === 'ar' ? 'كل أسبوعين' : 'Fortnightly'}<"),
    (">Monthly<", ">{lang === 'ar' ? 'شهري' : 'Monthly'}<"),
    (">Quarterly<", ">{lang === 'ar' ? 'ربع سنوي' : 'Quarterly'}<"),
    (">Annual<", ">{lang === 'ar' ? 'سنوي' : 'Annual'}<"),
]

if 'useLanguage' not in pm_new:
    pm_new = pm_new.replace(
        "import { useRouter } from 'next/navigation'",
        "import { useRouter } from 'next/navigation'\nimport { useLanguage } from '@/context/LanguageContext'"
    )
    pm_new = pm_new.replace(
        "  const router = useRouter()",
        "  const router = useRouter()\n  const { t, lang } = useLanguage()"
    )
elif "const { t }" in pm_new and "const { t, lang }" not in pm_new:
    pm_new = pm_new.replace("const { t } = useLanguage()", "const { t, lang } = useLanguage()")

changed4 = 0
for old, new in pm_replacements:
    if old in pm_new:
        pm_new = pm_new.replace(old, new)
        changed4 += 1

with open('src/app/dashboard/pm-schedules/new/page.tsx', 'w', encoding='utf-8') as f:
    f.write(pm_new)
print(f'PM new form: {changed4} fixes')

print('\nAll dashboard and form fixes complete')