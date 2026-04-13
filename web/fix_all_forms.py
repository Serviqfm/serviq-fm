import os

# ── Fix Inspections new page ──
with open('src/app/dashboard/inspections/new/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(
    "import { Suspense } from 'react'",
    "import { Suspense } from 'react'\nimport { useLanguage } from '@/context/LanguageContext'"
)
content = content.replace(
    "  const supabase = createClient()",
    "  const supabase = createClient()\n  const { t, lang } = useLanguage()"
)

replacements = [
    ("'Start Inspection'", "t('btn.start_inspection')"),
    ("'Back to Inspections'", "t('common.back')"),
    ("'Inspection Template *'", "lang === 'ar' ? 'نموذج التفتيش *' : 'Inspection Template *'"),
    ("'Select a template'", "lang === 'ar' ? 'اختر نموذجاً' : 'Select a template'"),
    ("'Site'", "t('common.site')"),
    ("'Asset (optional)'", "lang === 'ar' ? 'الأصل (اختياري)' : 'Asset (optional)'"),
    ("'Select site'", "lang === 'ar' ? 'اختر موقعاً' : 'Select site'"),
    ("'Select asset'", "lang === 'ar' ? 'اختر أصلاً' : 'Select asset'"),
    ("'Begin Checklist →'", "lang === 'ar' ? 'ابدأ القائمة ←' : 'Begin Checklist →'"),
    ("'Submit Inspection'", "lang === 'ar' ? 'تقديم التفتيش' : 'Submit Inspection'"),
    ("'Submitting...'", "t('common.saving')"),
    ("'Change setup'", "lang === 'ar' ? 'تغيير الإعداد' : 'Change setup'"),
    ("'← Change setup'", "lang === 'ar' ? 'تغيير الإعداد ←' : '← Change setup'"),
    ("'Not answered'", "lang === 'ar' ? 'لم تتم الإجابة' : 'Not answered'"),
    ("'>Pass<'", ">{lang === 'ar' ? 'ناجح' : 'Pass'}<"),
    ("'>Fail<'", ">{lang === 'ar' ? 'فاشل' : 'Fail'}<"),
    (">✓ Pass<", ">{lang === 'ar' ? '✓ ناجح' : '✓ Pass'}<"),
    (">✗ Fail<", ">{lang === 'ar' ? '✗ فاشل' : '✗ Fail'}<"),
    (">Yes<", ">{lang === 'ar' ? 'نعم' : 'Yes'}<"),
    (">No<", ">{lang === 'ar' ? 'لا' : 'No'}<"),
]

changed = 0
for old, new in replacements:
    if old in content:
        content = content.replace(old, new)
        changed += 1

with open('src/app/dashboard/inspections/new/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print(f'Inspections new: {changed} fixes')

# ── Fix Inspections templates new page ──
with open('src/app/dashboard/inspections/templates/new/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(
    "import { useRouter } from 'next/navigation'",
    "import { useRouter } from 'next/navigation'\nimport { useLanguage } from '@/context/LanguageContext'"
)
content = content.replace(
    "  const router = useRouter()",
    "  const router = useRouter()\n  const { t, lang } = useLanguage()"
)

tmpl_replacements = [
    ("'New Inspection Template'", "lang === 'ar' ? 'نموذج تفتيش جديد' : 'New Inspection Template'"),
    ("'Back to Inspections'", "t('common.back')"),
    ("'Template Name *'", "lang === 'ar' ? 'اسم النموذج *' : 'Template Name *'"),
    ("'Vertical'", "lang === 'ar' ? 'القطاع' : 'Vertical'"),
    ("'General'", "lang === 'ar' ? 'عام' : 'General'"),
    ("'School'", "lang === 'ar' ? 'مدرسة' : 'School'"),
    ("'Retail'", "lang === 'ar' ? 'تجزئة' : 'Retail'"),
    ("'Compound'", "lang === 'ar' ? 'مجمع' : 'Compound'"),
    ("'Hotel'", "lang === 'ar' ? 'فندق' : 'Hotel'"),
    ("'Load a vertical-specific template'", "lang === 'ar' ? 'تحميل نموذج خاص بالقطاع' : 'Load a vertical-specific template'"),
    ("'Checklist Items'", "lang === 'ar' ? 'عناصر القائمة' : 'Checklist Items'"),
    ("'+ Add Item'", "lang === 'ar' ? '+ إضافة عنصر' : '+ Add Item'"),
    ("'Pass / Fail'", "lang === 'ar' ? 'ناجح / فاشل' : 'Pass / Fail'"),
    ("'Yes / No'", "lang === 'ar' ? 'نعم / لا' : 'Yes / No'"),
    ("'Score (1-5)'", "lang === 'ar' ? 'تقييم (1-5)' : 'Score (1-5)'"),
    ("'Free Text'", "lang === 'ar' ? 'نص حر' : 'Free Text'"),
    ("'Photo Required'", "lang === 'ar' ? 'صورة مطلوبة' : 'Photo Required'"),
    ("'Required'", "lang === 'ar' ? 'مطلوب' : 'Required'"),
    ("'Saving...'", "t('common.saving')"),
    ("'Save Template'", "lang === 'ar' ? 'حفظ النموذج' : 'Save Template'"),
]

changed2 = 0
for old, new in tmpl_replacements:
    if old in content:
        content = content.replace(old, new)
        changed2 += 1

with open('src/app/dashboard/inspections/templates/new/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print(f'Templates new: {changed2} fixes')

# ── Fix WO new form remaining labels ──
with open('src/app/dashboard/work-orders/new/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Make sure lang is available
if "const { t, lang }" not in content and "const { t }" in content:
    content = content.replace("const { t } = useLanguage()", "const { t, lang } = useLanguage()")

wo_extra = [
    ("'SLA Hours (optional)'", "lang === 'ar' ? 'ساعات اتفاقية الخدمة (اختياري)' : 'SLA Hours (optional)'"),
    ("'Attach Photos'", "lang === 'ar' ? 'إرفاق صور' : 'Attach Photos'"),
    ("'Recurring Work Order'", "lang === 'ar' ? 'أمر عمل متكرر' : 'Recurring Work Order'"),
    ("'Back to Work Orders'", "t('common.back')"),
    ("'Select priority'", "lang === 'ar' ? 'اختر الأولوية' : 'Select priority'"),
    ("'Select category'", "lang === 'ar' ? 'اختر الفئة' : 'Select category'"),
    ("'Select site'", "lang === 'ar' ? 'اختر الموقع' : 'Select site'"),
    ("'Select asset'", "lang === 'ar' ? 'اختر الأصل' : 'Select asset'"),
    ("'Unassigned'", "t('common.unassigned')"),
    ("'Internal Technicians'", "lang === 'ar' ? 'فنيون داخليون' : 'Internal Technicians'"),
    ("'External Vendors'", "lang === 'ar' ? 'موردون خارجيون' : 'External Vendors'"),
    (">HVAC<", ">{t('cat.hvac')}<"),
    (">Electrical<", ">{t('cat.electrical')}<"),
    (">Plumbing<", ">{t('cat.plumbing')}<"),
    (">Fire Safety<", ">{t('cat.fire')}<"),
    (">Other<", ">{t('cat.other')}<"),
]

changed3 = 0
for old, new in wo_extra:
    if old in content:
        content = content.replace(old, new)
        changed3 += 1

with open('src/app/dashboard/work-orders/new/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print(f'WO new extra: {changed3} fixes')

# ── Fix Inventory new form ──
with open('src/app/dashboard/inventory/new/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

if "const { t, lang }" not in content and "const { t }" in content:
    content = content.replace("const { t } = useLanguage()", "const { t, lang } = useLanguage()")

inv_extra = [
    ("'Item Name (English) *'", "lang === 'ar' ? 'اسم العنصر *' : 'Item Name (English) *'"),
    ("'Item Name (Arabic)'", "lang === 'ar' ? 'اسم العنصر بالعربية' : 'Item Name (Arabic)'"),
    ("'SKU / Part Number'", "lang === 'ar' ? 'رمز المنتج / رقم القطعة' : 'SKU / Part Number'"),
    ("'Unit *'", "lang === 'ar' ? 'الوحدة *' : 'Unit *'"),
    ("'Current Stock *'", "lang === 'ar' ? 'المخزون الحالي *' : 'Current Stock *'"),
    ("'Minimum Stock Level'", "lang === 'ar' ? 'الحد الأدنى للمخزون' : 'Minimum Stock Level'"),
    ("'Unit Cost (SAR)'", "lang === 'ar' ? 'تكلفة الوحدة (ريال)' : 'Unit Cost (SAR)'"),
    ("'Storage Location'", "lang === 'ar' ? 'موقع التخزين' : 'Storage Location'"),
    ("'Piece'", "lang === 'ar' ? 'قطعة' : 'Piece'"),
    ("'Box'", "lang === 'ar' ? 'صندوق' : 'Box'"),
    ("'Litre'", "lang === 'ar' ? 'لتر' : 'Litre'"),
    ("'Roll'", "lang === 'ar' ? 'لفة' : 'Roll'"),
    ("'Set'", "lang === 'ar' ? 'مجموعة' : 'Set'"),
    ("'Pair'", "lang === 'ar' ? 'زوج' : 'Pair'"),
    ("'Back to Inventory'", "t('common.back')"),
]

changed4 = 0
for old, new in inv_extra:
    if old in content:
        content = content.replace(old, new)
        changed4 += 1

with open('src/app/dashboard/inventory/new/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print(f'Inventory new: {changed4} fixes')

# ── Fix Vendor new form ──
with open('src/app/dashboard/vendors/new/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

if "const { t, lang }" not in content and "const { t }" in content:
    content = content.replace("const { t } = useLanguage()", "const { t, lang } = useLanguage()")
elif 'useLanguage' not in content:
    content = content.replace(
        "import { useRouter } from 'next/navigation'",
        "import { useRouter } from 'next/navigation'\nimport { useLanguage } from '@/context/LanguageContext'"
    )
    content = content.replace(
        "  const router = useRouter()",
        "  const router = useRouter()\n  const { t, lang } = useLanguage()"
    )

vendor_extra = [
    ("'Company Name (English) *'", "lang === 'ar' ? 'اسم الشركة *' : 'Company Name (English) *'"),
    ("'Company Name (Arabic)'", "lang === 'ar' ? 'اسم الشركة بالعربية' : 'Company Name (Arabic)'"),
    ("'Contact Name'", "lang === 'ar' ? 'اسم جهة الاتصال' : 'Contact Name'"),
    ("'Phone'", "lang === 'ar' ? 'الهاتف' : 'Phone'"),
    ("'Email'", "lang === 'ar' ? 'البريد الإلكتروني' : 'Email'"),
    ("'Specialisation'", "lang === 'ar' ? 'التخصص' : 'Specialisation'"),
    ("'Select specialisation'", "lang === 'ar' ? 'اختر التخصص' : 'Select specialisation'"),
    ("'VAT Number'", "lang === 'ar' ? 'الرقم الضريبي' : 'VAT Number'"),
    ("'CR Number'", "lang === 'ar' ? 'رقم السجل التجاري' : 'CR Number'"),
    ("'Back to Vendors'", "t('common.back')"),
    ("'Adding User...'", "t('common.saving')"),
]

changed5 = 0
for old, new in vendor_extra:
    if old in content:
        content = content.replace(old, new)
        changed5 += 1

with open('src/app/dashboard/vendors/new/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print(f'Vendor new: {changed5} fixes')

# ── Fix Users new form ──
with open('src/app/dashboard/users/new/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

if "const { t, lang }" not in content and "const { t }" in content:
    content = content.replace("const { t } = useLanguage()", "const { t, lang } = useLanguage()")
elif 'useLanguage' not in content:
    content = content.replace(
        "import { useRouter } from 'next/navigation'",
        "import { useRouter } from 'next/navigation'\nimport { useLanguage } from '@/context/LanguageContext'"
    )
    content = content.replace(
        "  const router = useRouter()",
        "  const router = useRouter()\n  const { t, lang } = useLanguage()"
    )

user_extra = [
    ("'Full Name (English) *'", "lang === 'ar' ? 'الاسم الكامل *' : 'Full Name (English) *'"),
    ("'Full Name (Arabic)'", "lang === 'ar' ? 'الاسم بالعربية' : 'Full Name (Arabic)'"),
    ("'Email Address *'", "lang === 'ar' ? 'البريد الإلكتروني *' : 'Email Address *'"),
    ("'Phone Number'", "lang === 'ar' ? 'رقم الهاتف' : 'Phone Number'"),
    ("'Role *'", "lang === 'ar' ? 'الدور *' : 'Role *'"),
    ("'Technician'", "lang === 'ar' ? 'فني' : 'Technician'"),
    ("'Manager'", "lang === 'ar' ? 'مدير' : 'Manager'"),
    ("'Requester'", "lang === 'ar' ? 'مقدم طلب' : 'Requester'"),
    ("'Admin'", "lang === 'ar' ? 'مدير النظام' : 'Admin'"),
    ("'Back to Users'", "t('common.back')"),
    ("'Add Another'", "lang === 'ar' ? 'إضافة آخر' : 'Add Another'"),
    ("'View All Users'", "lang === 'ar' ? 'عرض جميع المستخدمين' : 'View All Users'"),
    ("'User Added'", "lang === 'ar' ? 'تم إضافة المستخدم' : 'User Added'"),
    ("'User Created Successfully'", "lang === 'ar' ? 'تم إنشاء المستخدم بنجاح' : 'User Created Successfully'"),
]

changed6 = 0
for old, new in user_extra:
    if old in content:
        content = content.replace(old, new)
        changed6 += 1

with open('src/app/dashboard/users/new/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print(f'Users new: {changed6} fixes')

print('\nAll form fixes complete')