import os

# ── 1. Fix Asset new form - all labels still English ──
with open('src/app/dashboard/assets/new/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

if 'useLanguage' not in content:
    content = content.replace(
        "import { useRouter } from 'next/navigation'",
        "import { useRouter } from 'next/navigation'\nimport { useLanguage } from '@/context/LanguageContext'"
    )
    content = content.replace(
        "  const router = useRouter()",
        "  const router = useRouter()\n  const { t, lang } = useLanguage()"
    )
elif "const { t, lang }" not in content:
    content = content.replace("const { t } = useLanguage()", "const { t, lang } = useLanguage()")

asset_labels = [
    ("Add New Asset", "lang === 'ar' ? 'إضافة أصل جديد' : 'Add New Asset'"),
    ("Back to Assets", "lang === 'ar' ? 'رجوع للأصول' : 'Back to Assets'"),
    ("* Asset Name", "lang === 'ar' ? '* اسم الأصل' : '* Asset Name'"),
    ("Asset Name *", "lang === 'ar' ? 'اسم الأصل *' : 'Asset Name *'"),
    ("Select category", "lang === 'ar' ? 'اختر الفئة' : 'Select category'"),
    ("Select site", "lang === 'ar' ? 'اختر الموقع' : 'Select site'"),
    ("Location Notes", "lang === 'ar' ? 'ملاحظات الموقع' : 'Location Notes'"),
    ("Sub-location", "lang === 'ar' ? 'الموقع الفرعي' : 'Sub-location'"),
    ("Model", "lang === 'ar' ? 'الموديل' : 'Model'"),
    ("Manufacturer", "lang === 'ar' ? 'الشركة المصنعة' : 'Manufacturer'"),
    ("Serial Number", "lang === 'ar' ? 'الرقم التسلسلي' : 'Serial Number'"),
    ("Purchase Cost (SAR)", "lang === 'ar' ? 'تكلفة الشراء (ريال)' : 'Purchase Cost (SAR)'"),
    ("Purchase Date", "lang === 'ar' ? 'تاريخ الشراء' : 'Purchase Date'"),
    ("Expected Lifespan (years)", "lang === 'ar' ? 'العمر الافتراضي (سنوات)' : 'Expected Lifespan (years)'"),
    ("Warranty Expiry", "lang === 'ar' ? 'انتهاء الضمان' : 'Warranty Expiry'"),
    ("Description", "lang === 'ar' ? 'الوصف' : 'Description'"),
    ("Save Asset", "lang === 'ar' ? 'حفظ الأصل' : 'Save Asset'"),
    ("Cancel", "lang === 'ar' ? 'إلغاء' : 'Cancel'"),
    ("Saving...", "lang === 'ar' ? 'جاري الحفظ...' : 'Saving...'"),
    ("Site", "lang === 'ar' ? 'الموقع' : 'Site'"),
    ("Category", "lang === 'ar' ? 'الفئة' : 'Category'"),
]

for old, new in asset_labels:
    # Replace as JSX text content
    for wrapper in [">{old}<", "'{old}'"]:
        actual_old = wrapper.replace('{old}', old)
        actual_new = ">{" + new + "}<" if wrapper.startswith('>') else "{" + new + "}"
        if actual_old in content:
            content = content.replace(actual_old, actual_new)

with open('src/app/dashboard/assets/new/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Asset new form updated')

# ── 2. Fix WO new form remaining English labels ──
with open('src/app/dashboard/work-orders/new/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

if "const { t, lang }" not in content:
    content = content.replace("const { t } = useLanguage()", "const { t, lang } = useLanguage()")

wo_labels = [
    (">* Title<", ">{lang === 'ar' ? '* العنوان' : '* Title'}<"),
    (">Description<", ">{lang === 'ar' ? 'الوصف' : 'Description'}<"),
    (">Category<", ">{lang === 'ar' ? 'الفئة' : 'Category'}<"),
    (">* Priority<", ">{lang === 'ar' ? '* الأولوية' : '* Priority'}<"),
    (">Asset<", ">{lang === 'ar' ? 'الأصل' : 'Asset'}<"),
    (">Site / Location<", ">{lang === 'ar' ? 'الموقع' : 'Site / Location'}<"),
    (">SLA (hours to resolve)<", ">{lang === 'ar' ? 'ساعات الخدمة' : 'SLA (hours to resolve)'}<"),
    (">Assign To<", ">{lang === 'ar' ? 'تعيين إلى' : 'Assign To'}<"),
    (">Due Date<", ">{lang === 'ar' ? 'تاريخ الاستحقاق' : 'Due Date'}<"),
    (">Select category<", ">{lang === 'ar' ? 'اختر الفئة' : 'Select category'}<"),
    (">Select asset<", ">{lang === 'ar' ? 'اختر الأصل' : 'Select asset'}<"),
    (">Select site<", ">{lang === 'ar' ? 'اختر الموقع' : 'Select site'}<"),
    (">Unassigned<", ">{t('common.unassigned')}<"),
    (">Internal Technicians<", ">{lang === 'ar' ? 'فنيون داخليون' : 'Internal Technicians'}<"),
    (">External Vendors<", ">{lang === 'ar' ? 'موردون خارجيون' : 'External Vendors'}<"),
]

for old, new in wo_labels:
    if old in content:
        content = content.replace(old, new)

with open('src/app/dashboard/work-orders/new/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('WO new form updated')

# ── 3. Fix PM new form ──
with open('src/app/dashboard/pm-schedules/new/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

if "const { t, lang }" not in content:
    content = content.replace("const { t } = useLanguage()", "const { t, lang } = useLanguage()")

pm_labels = [
    (">New PM Schedule<", ">{lang === 'ar' ? 'جدول صيانة جديد' : 'New PM Schedule'}<"),
    (">Back to PM Schedules<", ">{lang === 'ar' ? 'رجوع' : 'Back to PM Schedules'}<"),
    (">* Schedule Title<", ">{lang === 'ar' ? '* عنوان الجدول' : '* Schedule Title'}<"),
    (">Task Description<", ">{lang === 'ar' ? 'وصف المهمة' : 'Task Description'}<"),
    (">Estimated Duration (minutes)<", ">{lang === 'ar' ? 'المدة التقديرية (دقائق)' : 'Estimated Duration (minutes)'}<"),
    (">* Frequency<", ">{lang === 'ar' ? '* التكرار' : '* Frequency'}<"),
    (">Site<", ">{lang === 'ar' ? 'الموقع' : 'Site'}<"),
    (">Asset<", ">{lang === 'ar' ? 'الأصل' : 'Asset'}<"),
    (">* First Due Date<", ">{lang === 'ar' ? '* تاريخ الاستحقاق الأول' : '* First Due Date'}<"),
    (">Assign To<", ">{lang === 'ar' ? 'تعيين إلى' : 'Assign To'}<"),
    (">Unassigned<", ">{t('common.unassigned')}<"),
    (">Select site<", ">{lang === 'ar' ? 'اختر الموقع' : 'Select site'}<"),
    (">Select asset<", ">{lang === 'ar' ? 'اختر الأصل' : 'Select asset'}<"),
    (">Quick templates<", ">{lang === 'ar' ? 'قوالب سريعة' : 'Quick templates'}<"),
    (">Save Schedule<", ">{lang === 'ar' ? 'حفظ الجدول' : 'Save Schedule'}<"),
    (">Cancel<", ">{lang === 'ar' ? 'إلغاء' : 'Cancel'}<"),
    (">Saving...<", ">{lang === 'ar' ? 'جاري الحفظ...' : 'Saving...'}<"),
]

for old, new in pm_labels:
    if old in content:
        content = content.replace(old, new)

with open('src/app/dashboard/pm-schedules/new/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('PM new form updated')

# ── 4. Fix Sites new form ──
with open('src/app/dashboard/sites/new/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

if 'useLanguage' not in content:
    content = content.replace(
        "import { useRouter } from 'next/navigation'",
        "import { useRouter } from 'next/navigation'\nimport { useLanguage } from '@/context/LanguageContext'"
    )
    content = content.replace(
        "  const router = useRouter()",
        "  const router = useRouter()\n  const { t, lang } = useLanguage()"
    )

site_labels = [
    (">Add New Site<", ">{lang === 'ar' ? 'إضافة موقع جديد' : 'Add New Site'}<"),
    (">Back to Sites<", ">{lang === 'ar' ? 'رجوع للمواقع' : 'Back to Sites'}<"),
    (">* Site Name (English)<", ">{lang === 'ar' ? '* اسم الموقع (إنجليزي)' : '* Site Name (English)'}<"),
    (">Site Name (Arabic)<", ">{lang === 'ar' ? 'اسم الموقع (عربي)' : 'Site Name (Arabic)'}<"),
    (">City<", ">{lang === 'ar' ? 'المدينة' : 'City'}<"),
    (">Address<", ">{lang === 'ar' ? 'العنوان' : 'Address'}<"),
    (">Save Site<", ">{lang === 'ar' ? 'حفظ الموقع' : 'Save Site'}<"),
    (">Saving...<", ">{lang === 'ar' ? 'جاري الحفظ...' : 'Saving...'}<"),
]

for old, new in site_labels:
    if old in content:
        content = content.replace(old, new)

with open('src/app/dashboard/sites/new/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Sites new form updated')

# ── 5. Fix Vendor new form ──
with open('src/app/dashboard/vendors/new/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

if "const { t, lang }" not in content:
    if 'useLanguage' not in content:
        content = content.replace(
            "import { useRouter } from 'next/navigation'",
            "import { useRouter } from 'next/navigation'\nimport { useLanguage } from '@/context/LanguageContext'"
        )
        content = content.replace(
            "  const router = useRouter()",
            "  const router = useRouter()\n  const { t, lang } = useLanguage()"
        )
    else:
        content = content.replace("const { t } = useLanguage()", "const { t, lang } = useLanguage()")

vendor_labels = [
    (">Add New Vendor<", ">{lang === 'ar' ? 'إضافة مورد جديد' : 'Add New Vendor'}<"),
    (">Back to Vendors<", ">{lang === 'ar' ? 'رجوع للموردين' : 'Back to Vendors'}<"),
    (">* Company Name (English)<", ">{lang === 'ar' ? '* اسم الشركة (إنجليزي)' : '* Company Name (English)'}<"),
    (">Company Name (Arabic)<", ">{lang === 'ar' ? 'اسم الشركة (عربي)' : 'Company Name (Arabic)'}<"),
    (">Phone<", ">{lang === 'ar' ? 'الهاتف' : 'Phone'}<"),
    (">Contact Name<", ">{lang === 'ar' ? 'اسم جهة الاتصال' : 'Contact Name'}<"),
    (">Email<", ">{lang === 'ar' ? 'البريد الإلكتروني' : 'Email'}<"),
    (">Specialisation<", ">{lang === 'ar' ? 'التخصص' : 'Specialisation'}<"),
    (">Select specialisation<", ">{lang === 'ar' ? 'اختر التخصص' : 'Select specialisation'}<"),
    (">CR Number<", ">{lang === 'ar' ? 'رقم السجل التجاري' : 'CR Number'}<"),
    (">VAT Number<", ">{lang === 'ar' ? 'الرقم الضريبي' : 'VAT Number'}<"),
]

for old, new in vendor_labels:
    if old in content:
        content = content.replace(old, new)

with open('src/app/dashboard/vendors/new/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Vendor new form updated')

# ── 6. Fix Users new form ──
with open('src/app/dashboard/users/new/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

if "const { t, lang }" not in content:
    if 'useLanguage' not in content:
        content = content.replace(
            "import { useRouter } from 'next/navigation'",
            "import { useRouter } from 'next/navigation'\nimport { useLanguage } from '@/context/LanguageContext'"
        )
        content = content.replace(
            "  const router = useRouter()",
            "  const router = useRouter()\n  const { t, lang } = useLanguage()"
        )
    else:
        content = content.replace("const { t } = useLanguage()", "const { t, lang } = useLanguage()")

user_labels = [
    (">Add New User<", ">{lang === 'ar' ? 'إضافة مستخدم جديد' : 'Add New User'}<"),
    (">Back to Users<", ">{lang === 'ar' ? 'رجوع للمستخدمين' : 'Back to Users'}<"),
    (">* Full Name (English)<", ">{lang === 'ar' ? '* الاسم الكامل' : '* Full Name (English)'}<"),
    (">Full Name (Arabic)<", ">{lang === 'ar' ? 'الاسم بالعربية' : 'Full Name (Arabic)'}<"),
    (">* Email Address<", ">{lang === 'ar' ? '* البريد الإلكتروني' : '* Email Address'}<"),
    (">Phone Number<", ">{lang === 'ar' ? 'رقم الهاتف' : 'Phone Number'}<"),
    (">* Role<", ">{lang === 'ar' ? '* الدور' : '* Role'}<"),
    (">Technician<", ">{lang === 'ar' ? 'فني' : 'Technician'}<"),
    (">Manager<", ">{lang === 'ar' ? 'مدير' : 'Manager'}<"),
    (">Requester<", ">{lang === 'ar' ? 'مقدم طلب' : 'Requester'}<"),
    (">Admin<", ">{lang === 'ar' ? 'مدير النظام' : 'Admin'}<"),
    (">Create User<", ">{lang === 'ar' ? 'إنشاء مستخدم' : 'Create User'}<"),
    (">Creating User...<", ">{lang === 'ar' ? 'جاري الإنشاء...' : 'Creating User...'}<"),
    (">View All Users<", ">{lang === 'ar' ? 'عرض المستخدمين' : 'View All Users'}<"),
    (">Add Another<", ">{lang === 'ar' ? 'إضافة آخر' : 'Add Another'}<"),
    (">User Created Successfully<", ">{lang === 'ar' ? 'تم إنشاء المستخدم' : 'User Created Successfully'}<"),
]

for old, new in user_labels:
    if old in content:
        content = content.replace(old, new)

with open('src/app/dashboard/users/new/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Users new form updated')

# ── 7. Fix Inspection new form ──
with open('src/app/dashboard/inspections/new/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

insp_labels = [
    (">* Inspection Template<", ">{lang === 'ar' ? '* نموذج التفتيش' : '* Inspection Template'}<"),
    (">Select a template<", ">{lang === 'ar' ? 'اختر نموذجاً' : 'Select a template'}<"),
    (">Asset (optional)<", ">{lang === 'ar' ? 'الأصل (اختياري)' : 'Asset (optional)'}<"),
    (">Site<", ">{lang === 'ar' ? 'الموقع' : 'Site'}<"),
    (">Select asset<", ">{lang === 'ar' ? 'اختر أصلاً' : 'Select asset'}<"),
    (">Select site<", ">{lang === 'ar' ? 'اختر موقعاً' : 'Select site'}<"),
    (">Begin Checklist →<", ">{lang === 'ar' ? 'ابدأ القائمة ←' : 'Begin Checklist →'}<"),
    (">Submit Inspection<", ">{lang === 'ar' ? 'تقديم التفتيش' : 'Submit Inspection'}<"),
    (">← Change setup<", ">{lang === 'ar' ? 'تغيير الإعداد' : '← Change setup'}<"),
    (">Back to Inspections<", ">{lang === 'ar' ? 'رجوع للتفتيش' : 'Back to Inspections'}<"),
    (">Start Inspection<", ">{lang === 'ar' ? 'بدء التفتيش' : 'Start Inspection'}<"),
    (">✓ Pass<", ">{lang === 'ar' ? '✓ ناجح' : '✓ Pass'}<"),
    (">✗ Fail<", ">{lang === 'ar' ? '✗ فاشل' : '✗ Fail'}<"),
    (">Yes<", ">{lang === 'ar' ? 'نعم' : 'Yes'}<"),
    (">No<", ">{lang === 'ar' ? 'لا' : 'No'}<"),
    (">Not answered<", ">{lang === 'ar' ? 'لم تتم الإجابة' : 'Not answered'}<"),
    (">Photo upload available after submission<", ">{lang === 'ar' ? 'رفع الصور متاح بعد التقديم' : 'Photo upload available after submission'}<"),
]

for old, new in insp_labels:
    if old in content:
        content = content.replace(old, new)

with open('src/app/dashboard/inspections/new/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Inspection new form updated')

# ── 8. Fix PM list - remaining English text ──
with open('src/app/dashboard/pm-schedules/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix New PM Schedule button
content = content.replace(
    ">New PM Schedule +<",
    ">{lang === 'ar' ? '+ جدول صيانة جديد' : 'New PM Schedule +'}<"
)
content = content.replace(
    "New PM Schedule +",
    "{lang === 'ar' ? '+ جدول صيانة جديد' : 'New PM Schedule +'}"
)

# Fix Active badge in PM list rows
content = content.replace(
    ">Active<",
    ">{t('common.active')}<"
)
content = content.replace(
    "'Active'",
    "t('common.active')"
)

# Fix monthly/weekly etc frequency in rows
content = content.replace(
    "{s.frequency}",
    "{s.frequency === 'daily' ? t('pm.freq.daily') : s.frequency === 'weekly' ? t('pm.freq.weekly') : s.frequency === 'fortnightly' ? t('pm.freq.fortnightly') : s.frequency === 'monthly' ? t('pm.freq.monthly') : s.frequency === 'quarterly' ? t('pm.freq.quarterly') : s.frequency === 'biannual' ? t('pm.freq.biannual') : s.frequency === 'annual' ? t('pm.freq.annual') : s.frequency}"
)

# Fix Actions/Status/Assigned To column headers still English
content = content.replace(
    "'>Actions<'",
    "t('common.actions')"
)
content = content.replace(
    "'Assigned To'",
    "t('wo.col.assigned')"
)

# Make sure lang is available
if "const { t, lang }" not in content and "const { t }" in content:
    content = content.replace("const { t } = useLanguage()", "const { t, lang } = useLanguage()")

with open('src/app/dashboard/pm-schedules/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('PM list updated')

# ── 9. Add frequency translations to context ──
with open('src/context/LanguageContext.tsx', 'r', encoding='utf-8') as f:
    ctx = f.read()

if "'pm.freq.daily'" not in ctx:
    freq_en = """  'pm.freq.daily': 'Daily',
  'pm.freq.weekly': 'Weekly',
  'pm.freq.fortnightly': 'Fortnightly',
  'pm.freq.monthly': 'Monthly',
  'pm.freq.quarterly': 'Quarterly',
  'pm.freq.biannual': 'Every 6 Months',
  'pm.freq.annual': 'Annual',"""

    freq_ar = """  'pm.freq.daily': 'يومي',
  'pm.freq.weekly': 'أسبوعي',
  'pm.freq.fortnightly': 'كل أسبوعين',
  'pm.freq.monthly': 'شهري',
  'pm.freq.quarterly': 'ربع سنوي',
  'pm.freq.biannual': 'كل 6 أشهر',
  'pm.freq.annual': 'سنوي',"""

    ctx = ctx.replace(
        "  'common.unassigned': 'Unassigned',",
        freq_en + "\n  'common.unassigned': 'Unassigned',"
    )
    ctx = ctx.replace(
        "  'common.unassigned': '\u063a\u064a\u0631 \u0645\u0639\u064a\u064e\u0651\u0646',",
        freq_ar + "\n  'common.unassigned': '\u063a\u064a\u0631 \u0645\u0639\u064a\u064e\u0651\u0646',"
    )
    with open('src/context/LanguageContext.tsx', 'w', encoding='utf-8') as f:
        f.write(ctx)
    print('Frequency translations added')

print('\nAll form fixes complete')