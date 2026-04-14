# ── 1. Fix PM Schedules missing translation keys ──
with open('src/context/LanguageContext.tsx', 'r', encoding='utf-8') as f:
    ctx = f.read()

en_additions = """  'pm.col.title': 'Schedule',
  'pm.col.asset': 'Asset',
  'pm.col.freq': 'Frequency',
  'pm.col.compliance': 'Compliance',
  'pm.col.due': 'Next Due',
  'pm.col.last': 'Last Done',
  'wo.col.assigned': 'Assigned To',
  'wo.col.title': 'Title',
  'wo.col.priority': 'Priority',
  'wo.col.status': 'Status',
  'insp.col.template': 'Template',
  'insp.col.vertical': 'Vertical',
  'insp.col.site': 'Site',
  'insp.col.asset': 'Asset',
  'insp.col.by': 'Conducted By',
  'insp.col.date': 'Date',
  'insp.col.status': 'Status',
  'insp.col.result': 'Result',
  'insp.tab.templates': 'Templates',
  'insp.tab.inspections': 'Inspections',
  'users.requesters': 'Requesters',
  'users.technicians': 'Technicians',
  'users.managers': 'Managers',
  'users.admins': 'Admins',
  'users.in_org': 'users in your organisation',
  'wo.subtitle': 'total',
  'wo.in_progress': 'in progress',
  'wo.overdue': 'overdue',"""

ar_additions = """  'pm.col.title': 'الجدول',
  'pm.col.asset': 'الأصل',
  'pm.col.freq': 'التكرار',
  'pm.col.compliance': 'الالتزام',
  'pm.col.due': 'الاستحقاق التالي',
  'pm.col.last': 'آخر تنفيذ',
  'wo.col.assigned': 'مُعيَّن إلى',
  'wo.col.title': 'العنوان',
  'wo.col.priority': 'الأولوية',
  'wo.col.status': 'الحالة',
  'insp.col.template': 'النموذج',
  'insp.col.vertical': 'القطاع',
  'insp.col.site': 'الموقع',
  'insp.col.asset': 'الأصل',
  'insp.col.by': 'أُجري بواسطة',
  'insp.col.date': 'التاريخ',
  'insp.col.status': 'الحالة',
  'insp.col.result': 'النتيجة',
  'insp.tab.templates': 'النماذج',
  'insp.tab.inspections': 'التفتيش',
  'users.requesters': 'مقدمو الطلبات',
  'users.technicians': 'الفنيون',
  'users.managers': 'المديرون',
  'users.admins': 'المشرفون',
  'users.in_org': 'مستخدمون في مؤسستك',
  'wo.subtitle': 'إجمالي',
  'wo.in_progress': 'قيد التنفيذ',
  'wo.overdue': 'متأخر',"""

if "'pm.col.title'" not in ctx:
    ctx = ctx.replace(
        "  'common.unassigned': 'Unassigned',",
        en_additions + "\n  'common.unassigned': 'Unassigned',"
    )
    ctx = ctx.replace(
        "  'common.unassigned': '\u063a\u064a\u0631 \u0645\u0639\u064a\u064e\u0651\u0646',",
        ar_additions + "\n  'common.unassigned': '\u063a\u064a\u0631 \u0645\u0639\u064a\u064e\u0651\u0646',"
    )
    with open('src/context/LanguageContext.tsx', 'w', encoding='utf-8') as f:
        f.write(ctx)
    print('Translation keys added')
else:
    print('Keys already exist')

# ── 2. Fix Work Orders subtitle ──
with open('src/app/dashboard/work-orders/page.tsx', 'r', encoding='utf-8') as f:
    wo = f.read()

wo = wo.replace(
    "{total} total · {inProgress} in progress · {overdue} overdue",
    "{total} {t('wo.subtitle')} · {inProgress} {t('wo.in_progress')} · {overdue} {t('wo.overdue')}"
)
wo = wo.replace(
    "total · {wos.filter",
    "{t('wo.subtitle')} · {wos.filter"
)
wo = wo.replace(
    "in progress · ",
    "{t('wo.in_progress')} · "
)
wo = wo.replace(
    "0 in progress · 0 overdue",
    "0 {t('wo.in_progress')} · 0 {t('wo.overdue')}"
)
# Find and fix the subtitle
import re
wo = re.sub(
    r"total \{.*?\} in progress",
    "{t('wo.subtitle')} {wos.filter(w => w.status === 'in_progress').length} {t('wo.in_progress')}",
    wo
)

with open('src/app/dashboard/work-orders/page.tsx', 'w', encoding='utf-8') as f:
    f.write(wo)
print('WO subtitle fixed')

# ── 3. Fix Inspections page ──
with open('src/app/dashboard/inspections/page.tsx', 'r', encoding='utf-8') as f:
    insp = f.read()

if "const { t, lang }" not in insp and "const { t }" in insp:
    insp = insp.replace("const { t } = useLanguage()", "const { t, lang } = useLanguage()")
elif "const { t }" not in insp and 'useLanguage' in insp:
    insp = insp.replace("const { lang } = useLanguage()", "const { t, lang } = useLanguage()")

insp_fixes = [
    ("'Templates'", "t('insp.tab.templates')"),
    ("'Inspections'", "t('insp.tab.inspections')"),
    (">Templates<", ">{t('insp.tab.templates')}<"),
    (">Inspections (<", ">{t('insp.tab.inspections')} (<"),
    ("'Actions'", "t('common.actions')"),
    ("'Date'", "t('insp.col.date')"),
    ("'Status'", "t('insp.col.status')"),
    ("'Result'", "t('insp.col.result')"),
    ("'Asset'", "t('insp.col.asset')"),
    ("'Site'", "t('insp.col.site')"),
    ("'Vertical'", "t('insp.col.vertical')"),
    ("'Template'", "t('insp.col.template')"),
    ("'Conducted By'", "t('insp.col.by')"),
    (">Actions<", ">{t('common.actions')}<"),
    (">Date<", ">{t('insp.col.date')}<"),
    (">Status<", ">{t('insp.col.status')}<"),
    (">Result<", ">{t('insp.col.result')}<"),
    (">Asset<", ">{t('insp.col.asset')}<"),
    (">Site<", ">{t('insp.col.site')}<"),
    (">Delete<", ">{t('common.delete')}<"),
    (">View<", ">{t('common.view')}<"),
    ("'Completed'", "t('wo.status.completed')"),
    ("'Pass'", "lang === 'ar' ? 'ناجح' : 'Pass'"),
    ("'Fail'", "lang === 'ar' ? 'فاشل' : 'Fail'"),
    ("'Partial'", "lang === 'ar' ? 'جزئي' : 'Partial'"),
    ("inspections ·", "{t('insp.tab.inspections').toLowerCase()} ·"),
    ("templates", "t('insp.tab.templates').toLowerCase()"),
]

changed = 0
for old, new in insp_fixes:
    if old in insp:
        insp = insp.replace(old, new)
        changed += 1

with open('src/app/dashboard/inspections/page.tsx', 'w', encoding='utf-8') as f:
    f.write(insp)
print(f'Inspections page: {changed} fixes')

# ── 4. Fix Users page ──
with open('src/app/dashboard/users/page.tsx', 'r', encoding='utf-8') as f:
    users = f.read()

if "const { t, lang }" not in users and "const { t }" in users:
    users = users.replace("const { t } = useLanguage()", "const { t, lang } = useLanguage()")

user_fixes = [
    (">Requesters<", ">{t('users.requesters')}<"),
    (">Technicians<", ">{t('users.technicians')}<"),
    (">Managers<", ">{t('users.managers')}<"),
    (">Admins<", ">{t('users.admins')}<"),
    ("'Requesters'", "t('users.requesters')"),
    ("'Technicians'", "t('users.technicians')"),
    ("'Managers'", "t('users.managers')"),
    ("'Admins'", "t('users.admins')"),
    ("users in your organisation", "{t('users.in_org')}"),
    ("'users in your organisation'", "t('users.in_org')"),
    (">Actions<", ">{t('common.actions')}<"),
    (">Status<", ">{t('common.status')}<"),
    (">Name<", ">{t('common.name') || 'Name'}<"),
    (">Email<", ">{lang === 'ar' ? 'البريد الإلكتروني' : 'Email'}<"),
    (">Role<", ">{lang === 'ar' ? 'الدور' : 'Role'}<"),
    (">Last Active<", ">{lang === 'ar' ? 'آخر نشاط' : 'Last Active'}<"),
    (">Deactivate<", ">{lang === 'ar' ? 'تعطيل' : 'Deactivate'}<"),
    (">Activate<", ">{lang === 'ar' ? 'تفعيل' : 'Activate'}<"),
    (">Edit<", ">{t('common.edit')}<"),
    ("'Active'", "t('common.active')"),
    (">Active<", ">{t('common.active')}<"),
    ("'(you)'", "lang === 'ar' ? '(أنت)' : '(you)'"),
]

changed2 = 0
for old, new in user_fixes:
    if old in users:
        users = users.replace(old, new)
        changed2 += 1

with open('src/app/dashboard/users/page.tsx', 'w', encoding='utf-8') as f:
    f.write(users)
print(f'Users page: {changed2} fixes')

print('\nAll remaining translations fixed')