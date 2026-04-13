import os

os.makedirs('src/context', exist_ok=True)
os.makedirs('src/lib', exist_ok=True)

# ── 1. Language Context ──
lang_context = """'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

type Language = 'en' | 'ar'

interface LanguageContextType {
  lang: Language
  setLang: (lang: Language) => void
  t: (key: string) => string
  isRTL: boolean
}

const LanguageContext = createContext<LanguageContextType>({
  lang: 'en',
  setLang: () => {},
  t: (key) => key,
  isRTL: false,
})

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>('en')

  useEffect(() => {
    const stored = localStorage.getItem('serviq_lang') as Language
    if (stored === 'ar' || stored === 'en') {
      setLangState(stored)
      document.documentElement.dir = stored === 'ar' ? 'rtl' : 'ltr'
      document.documentElement.lang = stored
    }
  }, [])

  function setLang(newLang: Language) {
    setLangState(newLang)
    localStorage.setItem('serviq_lang', newLang)
    document.documentElement.dir = newLang === 'ar' ? 'rtl' : 'ltr'
    document.documentElement.lang = newLang
  }

  function t(key: string): string {
    const translations = lang === 'ar' ? ar : en
    return translations[key] ?? en[key] ?? key
  }

  return (
    <LanguageContext.Provider value={{ lang, setLang, t, isRTL: lang === 'ar' }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  return useContext(LanguageContext)
}

// ── English translations ──
const en: Record<string, string> = {
  // Navigation
  'nav.dashboard':     'Dashboard',
  'nav.workorders':    'Work Orders',
  'nav.assets':        'Assets',
  'nav.pm':            'PM Schedules',
  'nav.inspections':   'Inspections',
  'nav.inventory':     'Inventory',
  'nav.vendors':       'Vendors',
  'nav.sites':         'Sites',
  'nav.users':         'Users',
  'nav.settings':      'Settings',

  // Dashboard
  'dashboard.title':           'Dashboard',
  'dashboard.open_wos':        'Open Work Orders',
  'dashboard.overdue':         'Overdue',
  'dashboard.pm_due_today':    'PM Due Today',
  'dashboard.completed_month': 'Completed This Month',
  'dashboard.active_techs':    'Active Technicians',
  'dashboard.pm_compliance':   'PM Compliance',
  'dashboard.avg_repair':      'Avg Repair Time (hrs)',
  'dashboard.cost_mtd':        'Maintenance Cost (MTD)',
  'dashboard.total_assets':    'Total Assets',
  'dashboard.recent_activity': 'Recent Activity',
  'dashboard.upcoming_pm':     'Upcoming PM Tasks',
  'dashboard.view_all':        'View all',
  'dashboard.new_wo':          '+ New Work Order',
  'dashboard.add_asset':       '+ Add Asset',
  'dashboard.new_pm':          '+ New PM Schedule',
  'dashboard.today':           'Today',
  'dashboard.tomorrow':        'Tomorrow',
  'dashboard.in_days':         'In {n} days',

  // Work Orders
  'wo.title':           'Work Orders',
  'wo.new':             '+ New Work Order',
  'wo.search':          'Search work orders...',
  'wo.status.new':          'New',
  'wo.status.assigned':     'Assigned',
  'wo.status.in_progress':  'In Progress',
  'wo.status.on_hold':      'On Hold',
  'wo.status.completed':    'Completed',
  'wo.status.closed':       'Closed',
  'wo.priority.critical':   'Critical',
  'wo.priority.high':       'High',
  'wo.priority.medium':     'Medium',
  'wo.priority.low':        'Low',
  'wo.col.title':       'Title',
  'wo.col.asset':       'Asset',
  'wo.col.assigned':    'Assigned To',
  'wo.col.priority':    'Priority',
  'wo.col.status':      'Status',
  'wo.col.due':         'Due Date',
  'wo.col.site':        'Site',
  'wo.col.actions':     'Actions',
  'wo.overdue':         'Overdue',
  'wo.no_wos':          'No work orders found',
  'wo.edit':            'Edit',
  'wo.delete':          'Delete',
  'wo.view':            'View',
  'wo.close':           'Close',
  'wo.approve':         'Approve & Close',
  'wo.reopen':          'Reopen',

  // Assets
  'assets.title':       'Assets',
  'assets.new':         '+ Add Asset',
  'assets.search':      'Search assets...',
  'assets.import':      'Import CSV',
  'assets.export':      'Export',
  'assets.col.name':    'Asset Name',
  'assets.col.cat':     'Category',
  'assets.col.site':    'Site',
  'assets.col.serial':  'Serial Number',
  'assets.col.status':  'Status',
  'assets.col.warranty':'Warranty Expiry',
  'assets.col.added':   'Added',
  'assets.no_assets':   'No assets yet',
  'assets.status.active':            'Active',
  'assets.status.under_maintenance': 'Under Maintenance',
  'assets.status.retired':           'Retired',

  // PM Schedules
  'pm.title':           'PM Schedules',
  'pm.new':             '+ New Schedule',
  'pm.calendar':        'Calendar',
  'pm.compliance':      'Compliance',
  'pm.col.schedule':    'Schedule',
  'pm.col.asset':       'Asset',
  'pm.col.freq':        'Frequency',
  'pm.col.assigned':    'Assigned To',
  'pm.col.due':         'Next Due',
  'pm.col.status':      'Status',
  'pm.col.actions':     'Actions',
  'pm.pause':           'Pause',
  'pm.resume':          'Resume',
  'pm.generate':        'Generate WO',
  'pm.edit':            'Edit',
  'pm.delete':          'Delete',
  'pm.no_schedules':    'No PM schedules yet',

  // Inspections
  'insp.title':         'Inspections',
  'insp.new':           '+ Start Inspection',
  'insp.new_template':  '+ New Template',
  'insp.tab.insp':      'Inspections',
  'insp.tab.templates': 'Templates',
  'insp.col.template':  'Template',
  'insp.col.vertical':  'Vertical',
  'insp.col.site':      'Site',
  'insp.col.asset':     'Asset',
  'insp.col.by':        'Conducted By',
  'insp.col.result':    'Result',
  'insp.col.status':    'Status',
  'insp.col.date':      'Date',
  'insp.result.pass':   'Pass',
  'insp.result.fail':   'Fail',
  'insp.result.partial':'Partial',

  // Inventory
  'inv.title':          'Inventory',
  'inv.new':            '+ Add Item',
  'inv.search':         'Search inventory...',
  'inv.low_stock':      'Low Stock Alert',
  'inv.col.name':       'Item Name',
  'inv.col.sku':        'SKU',
  'inv.col.cat':        'Category',
  'inv.col.location':   'Location',
  'inv.col.stock':      'Stock',
  'inv.col.min':        'Min Stock',
  'inv.col.cost':       'Unit Cost',
  'inv.col.status':     'Status',
  'inv.status.in':      'In Stock',
  'inv.status.low':     'Low Stock',
  'inv.status.out':     'Out of Stock',

  // Vendors
  'vendors.title':      'Vendors',
  'vendors.new':        '+ Add Vendor',
  'vendors.search':     'Search vendors...',
  'vendors.col.company':'Company',
  'vendors.col.contact':'Contact',
  'vendors.col.phone':  'Phone',
  'vendors.col.spec':   'Specialisation',
  'vendors.col.rating': 'Rating',
  'vendors.col.status': 'Status',
  'vendors.col.actions':'Actions',

  // Users
  'users.title':        'Users',
  'users.new':          '+ Add User',
  'users.col.name':     'Name',
  'users.col.email':    'Email',
  'users.col.role':     'Role',
  'users.col.status':   'Status',
  'users.col.active':   'Last Active',
  'users.col.actions':  'Actions',
  'users.role.admin':       'Admin',
  'users.role.manager':     'Manager',
  'users.role.technician':  'Technician',
  'users.role.requester':   'Requester',

  // Common
  'common.save':        'Save',
  'common.cancel':      'Cancel',
  'common.edit':        'Edit',
  'common.delete':      'Delete',
  'common.view':        'View',
  'common.back':        'Back',
  'common.loading':     'Loading...',
  'common.saving':      'Saving...',
  'common.search':      'Search',
  'common.filter':      'Filter',
  'common.export':      'Export',
  'common.import':      'Import',
  'common.yes':         'Yes',
  'common.no':          'No',
  'common.active':      'Active',
  'common.inactive':    'Inactive',
  'common.actions':     'Actions',
  'common.name':        'Name',
  'common.description': 'Description',
  'common.date':        'Date',
  'common.status':      'Status',
  'common.priority':    'Priority',
  'common.site':        'Site',
  'common.asset':       'Asset',
  'common.assign':      'Assign To',
  'common.due_date':    'Due Date',
  'common.created':     'Created',
  'common.updated':     'Updated',
  'common.notes':       'Notes',
  'common.required':    'Required',
  'common.optional':    'Optional',
  'common.select':      'Select',
  'common.none':        'None',
  'common.all':         'All',
  'common.sar':         'SAR',
  'common.deactivate':  'Deactivate',
  'common.activate':    'Activate',
  'common.confirm_delete': 'Are you sure you want to delete this?',
}

// ── Arabic translations ──
const ar: Record<string, string> = {
  // Navigation
  'nav.dashboard':     'لوحة التحكم',
  'nav.workorders':    'أوامر العمل',
  'nav.assets':        'الأصول',
  'nav.pm':            'جداول الصيانة',
  'nav.inspections':   'التفتيش',
  'nav.inventory':     'المخزون',
  'nav.vendors':       'الموردون',
  'nav.sites':         'المواقع',
  'nav.users':         'المستخدمون',
  'nav.settings':      'الإعدادات',

  // Dashboard
  'dashboard.title':           'لوحة التحكم',
  'dashboard.open_wos':        'أوامر العمل المفتوحة',
  'dashboard.overdue':         'متأخرة',
  'dashboard.pm_due_today':    'صيانة مستحقة اليوم',
  'dashboard.completed_month': 'مكتملة هذا الشهر',
  'dashboard.active_techs':    'فنيون نشطون',
  'dashboard.pm_compliance':   'الالتزام بالصيانة',
  'dashboard.avg_repair':      'متوسط وقت الإصلاح (ساعة)',
  'dashboard.cost_mtd':        'تكلفة الصيانة (الشهر الحالي)',
  'dashboard.total_assets':    'إجمالي الأصول',
  'dashboard.recent_activity': 'النشاط الأخير',
  'dashboard.upcoming_pm':     'مهام الصيانة القادمة',
  'dashboard.view_all':        'عرض الكل',
  'dashboard.new_wo':          '+ أمر عمل جديد',
  'dashboard.add_asset':       '+ إضافة أصل',
  'dashboard.new_pm':          '+ جدول صيانة جديد',
  'dashboard.today':           'اليوم',
  'dashboard.tomorrow':        'غداً',
  'dashboard.in_days':         'بعد {n} أيام',

  // Work Orders
  'wo.title':           'أوامر العمل',
  'wo.new':             '+ أمر عمل جديد',
  'wo.search':          'البحث في أوامر العمل...',
  'wo.status.new':          'جديد',
  'wo.status.assigned':     'مُعيَّن',
  'wo.status.in_progress':  'قيد التنفيذ',
  'wo.status.on_hold':      'معلق',
  'wo.status.completed':    'مكتمل',
  'wo.status.closed':       'مغلق',
  'wo.priority.critical':   'حرج',
  'wo.priority.high':       'عالي',
  'wo.priority.medium':     'متوسط',
  'wo.priority.low':        'منخفض',
  'wo.col.title':       'العنوان',
  'wo.col.asset':       'الأصل',
  'wo.col.assigned':    'مُعيَّن إلى',
  'wo.col.priority':    'الأولوية',
  'wo.col.status':      'الحالة',
  'wo.col.due':         'تاريخ الاستحقاق',
  'wo.col.site':        'الموقع',
  'wo.col.actions':     'الإجراءات',
  'wo.overdue':         'متأخر',
  'wo.no_wos':          'لا توجد أوامر عمل',
  'wo.edit':            'تعديل',
  'wo.delete':          'حذف',
  'wo.view':            'عرض',
  'wo.close':           'إغلاق',
  'wo.approve':         'موافقة وإغلاق',
  'wo.reopen':          'إعادة فتح',

  // Assets
  'assets.title':       'الأصول',
  'assets.new':         '+ إضافة أصل',
  'assets.search':      'البحث في الأصول...',
  'assets.import':      'استيراد CSV',
  'assets.export':      'تصدير',
  'assets.col.name':    'اسم الأصل',
  'assets.col.cat':     'الفئة',
  'assets.col.site':    'الموقع',
  'assets.col.serial':  'الرقم التسلسلي',
  'assets.col.status':  'الحالة',
  'assets.col.warranty':'انتهاء الضمان',
  'assets.col.added':   'تاريخ الإضافة',
  'assets.no_assets':   'لا توجد أصول بعد',
  'assets.status.active':            'نشط',
  'assets.status.under_maintenance': 'تحت الصيانة',
  'assets.status.retired':           'متقاعد',

  // PM Schedules
  'pm.title':           'جداول الصيانة الوقائية',
  'pm.new':             '+ جدول جديد',
  'pm.calendar':        'التقويم',
  'pm.compliance':      'الالتزام',
  'pm.col.schedule':    'الجدول',
  'pm.col.asset':       'الأصل',
  'pm.col.freq':        'التكرار',
  'pm.col.assigned':    'مُعيَّن إلى',
  'pm.col.due':         'الاستحقاق التالي',
  'pm.col.status':      'الحالة',
  'pm.col.actions':     'الإجراءات',
  'pm.pause':           'إيقاف مؤقت',
  'pm.resume':          'استئناف',
  'pm.generate':        'إنشاء أمر عمل',
  'pm.edit':            'تعديل',
  'pm.delete':          'حذف',
  'pm.no_schedules':    'لا توجد جداول صيانة بعد',

  // Inspections
  'insp.title':         'التفتيش',
  'insp.new':           '+ بدء تفتيش',
  'insp.new_template':  '+ نموذج جديد',
  'insp.tab.insp':      'عمليات التفتيش',
  'insp.tab.templates': 'النماذج',
  'insp.col.template':  'النموذج',
  'insp.col.vertical':  'القطاع',
  'insp.col.site':      'الموقع',
  'insp.col.asset':     'الأصل',
  'insp.col.by':        'أُجري بواسطة',
  'insp.col.result':    'النتيجة',
  'insp.col.status':    'الحالة',
  'insp.col.date':      'التاريخ',
  'insp.result.pass':   'ناجح',
  'insp.result.fail':   'فاشل',
  'insp.result.partial':'جزئي',

  // Inventory
  'inv.title':          'المخزون',
  'inv.new':            '+ إضافة عنصر',
  'inv.search':         'البحث في المخزون...',
  'inv.low_stock':      'تنبيه انخفاض المخزون',
  'inv.col.name':       'اسم العنصر',
  'inv.col.sku':        'رمز المنتج',
  'inv.col.cat':        'الفئة',
  'inv.col.location':   'الموقع',
  'inv.col.stock':      'المخزون',
  'inv.col.min':        'الحد الأدنى',
  'inv.col.cost':       'تكلفة الوحدة',
  'inv.col.status':     'الحالة',
  'inv.status.in':      'متوفر',
  'inv.status.low':     'منخفض',
  'inv.status.out':     'نفد المخزون',

  // Vendors
  'vendors.title':      'الموردون',
  'vendors.new':        '+ إضافة مورد',
  'vendors.search':     'البحث في الموردين...',
  'vendors.col.company':'الشركة',
  'vendors.col.contact':'جهة الاتصال',
  'vendors.col.phone':  'الهاتف',
  'vendors.col.spec':   'التخصص',
  'vendors.col.rating': 'التقييم',
  'vendors.col.status': 'الحالة',
  'vendors.col.actions':'الإجراءات',

  // Users
  'users.title':        'المستخدمون',
  'users.new':          '+ إضافة مستخدم',
  'users.col.name':     'الاسم',
  'users.col.email':    'البريد الإلكتروني',
  'users.col.role':     'الدور',
  'users.col.status':   'الحالة',
  'users.col.active':   'آخر نشاط',
  'users.col.actions':  'الإجراءات',
  'users.role.admin':       'مدير النظام',
  'users.role.manager':     'مدير',
  'users.role.technician':  'فني',
  'users.role.requester':   'مقدم طلب',

  // Common
  'common.save':        'حفظ',
  'common.cancel':      'إلغاء',
  'common.edit':        'تعديل',
  'common.delete':      'حذف',
  'common.view':        'عرض',
  'common.back':        'رجوع',
  'common.loading':     'جاري التحميل...',
  'common.saving':      'جاري الحفظ...',
  'common.search':      'بحث',
  'common.filter':      'تصفية',
  'common.export':      'تصدير',
  'common.import':      'استيراد',
  'common.yes':         'نعم',
  'common.no':          'لا',
  'common.active':      'نشط',
  'common.inactive':    'غير نشط',
  'common.actions':     'الإجراءات',
  'common.name':        'الاسم',
  'common.description': 'الوصف',
  'common.date':        'التاريخ',
  'common.status':      'الحالة',
  'common.priority':    'الأولوية',
  'common.site':        'الموقع',
  'common.asset':       'الأصل',
  'common.assign':      'تعيين إلى',
  'common.due_date':    'تاريخ الاستحقاق',
  'common.created':     'تاريخ الإنشاء',
  'common.updated':     'تاريخ التحديث',
  'common.notes':       'ملاحظات',
  'common.required':    'مطلوب',
  'common.optional':    'اختياري',
  'common.select':      'اختر',
  'common.none':        'لا شيء',
  'common.all':         'الكل',
  'common.sar':         'ر.س',
  'common.deactivate':  'تعطيل',
  'common.activate':    'تفعيل',
  'common.confirm_delete': 'هل أنت متأكد من حذف هذا العنصر؟',
}"""

with open('src/context/LanguageContext.tsx', 'w', encoding='utf-8') as f:
    f.write(lang_context)
print('LanguageContext.tsx written')

# ── 2. Language Toggle Button Component ──
lang_toggle = """'use client'

import { useLanguage } from '@/context/LanguageContext'

export default function LanguageToggle({ minimal = false }: { minimal?: boolean }) {
  const { lang, setLang } = useLanguage()

  return (
    <button
      onClick={() => setLang(lang === 'en' ? 'ar' : 'en')}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: minimal ? '4px 10px' : '6px 14px',
        borderRadius: 20,
        border: '1px solid rgba(255,255,255,0.2)',
        background: 'rgba(255,255,255,0.1)',
        color: 'white',
        cursor: 'pointer',
        fontSize: minimal ? 11 : 12,
        fontWeight: 500,
        letterSpacing: 0.3,
      }}
      title={lang === 'en' ? 'Switch to Arabic' : 'التبديل إلى الإنجليزية'}
    >
      <span style={{ fontSize: minimal ? 14 : 16 }}>{lang === 'en' ? '🇸🇦' : '🇬🇧'}</span>
      <span>{lang === 'en' ? 'العربية' : 'English'}</span>
    </button>
  )
}"""

os.makedirs('src/components', exist_ok=True)
with open('src/components/LanguageToggle.tsx', 'w', encoding='utf-8') as f:
    f.write(lang_toggle)
print('LanguageToggle.tsx written')

# ── 3. Update dashboard layout to wrap with LanguageProvider ──
layout_path = 'src/app/dashboard/layout.tsx'
with open(layout_path, 'r', encoding='utf-8') as f:
    layout = f.read()

if 'LanguageProvider' not in layout:
    layout = layout.replace(
        "import Sidebar from '@/components/Sidebar'",
        "import Sidebar from '@/components/Sidebar'\nimport { LanguageProvider } from '@/context/LanguageContext'"
    )
    layout = layout.replace(
        "    <div style={{ display: 'flex', minHeight: '100vh' }}>",
        "    <LanguageProvider>\n    <div style={{ display: 'flex', minHeight: '100vh' }}>"
    )
    # Find closing div and wrap
    layout = layout.replace(
        "    </div>\n  )\n}",
        "    </div>\n    </LanguageProvider>\n  )\n}"
    )
    with open(layout_path, 'w', encoding='utf-8') as f:
        f.write(layout)
    print('Dashboard layout updated with LanguageProvider')
else:
    print('LanguageProvider already in layout')

# ── 4. Update Sidebar to include language toggle and translated nav labels ──
with open('src/components/Sidebar.tsx', 'r', encoding='utf-8') as f:
    sidebar = f.read()

if 'useLanguage' not in sidebar:
    sidebar = sidebar.replace(
        "'use client'",
        "'use client'\n\nimport { useLanguage } from '@/context/LanguageContext'\nimport LanguageToggle from '@/components/LanguageToggle'"
    )

    # Add useLanguage hook after component declaration
    sidebar = sidebar.replace(
        "export default function Sidebar() {",
        "export default function Sidebar() {\n  const { t, lang, isRTL } = useLanguage()"
    )

    # Add language toggle to sidebar footer
    sidebar = sidebar.replace(
        "      <div style={{ padding: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>",
        "      <div style={{ padding: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>\n        <div style={{ marginBottom: 10 }}>\n          <LanguageToggle minimal />\n        </div>"
    )

    with open('src/components/Sidebar.tsx', 'w', encoding='utf-8') as f:
        f.write(sidebar)
    print('Sidebar updated with language toggle')
else:
    print('Sidebar already has useLanguage')

# ── 5. Update Dashboard page to use translations ──
with open('src/app/dashboard/page.tsx', 'r', encoding='utf-8') as f:
    dashboard = f.read()

if 'useLanguage' not in dashboard:
    dashboard = dashboard.replace(
        "import Link from 'next/link'",
        "import Link from 'next/link'\nimport { useLanguage } from '@/context/LanguageContext'"
    )
    dashboard = dashboard.replace(
        "  const supabase = createClient()",
        "  const supabase = createClient()\n  const { t } = useLanguage()"
    )
    # Update stat card labels to use translations
    dashboard = dashboard.replace(
        "    { label: 'Open Work Orders',",
        "    { label: t('dashboard.open_wos'),"
    )
    dashboard = dashboard.replace(
        "    { label: 'Overdue',",
        "    { label: t('dashboard.overdue'),"
    )
    dashboard = dashboard.replace(
        "    { label: 'PM Due Today',",
        "    { label: t('dashboard.pm_due_today'),"
    )
    dashboard = dashboard.replace(
        "    { label: 'Completed This Month',",
        "    { label: t('dashboard.completed_month'),"
    )
    dashboard = dashboard.replace(
        "    { label: 'Active Technicians',",
        "    { label: t('dashboard.active_techs'),"
    )
    dashboard = dashboard.replace(
        "    { label: 'PM Compliance',",
        "    { label: t('dashboard.pm_compliance'),"
    )
    dashboard = dashboard.replace(
        "    { label: 'Avg Repair Time (hrs)',",
        "    { label: t('dashboard.avg_repair'),"
    )
    dashboard = dashboard.replace(
        "    { label: 'Maintenance Cost (MTD)',",
        "    { label: t('dashboard.cost_mtd'),"
    )
    dashboard = dashboard.replace(
        "    { label: 'Total Assets',",
        "    { label: t('dashboard.total_assets'),"
    )
    # Update section headings
    dashboard = dashboard.replace(
        "'Recent Activity'",
        "t('dashboard.recent_activity')"
    )
    dashboard = dashboard.replace(
        "'Upcoming PM Tasks'",
        "t('dashboard.upcoming_pm')"
    )
    dashboard = dashboard.replace(
        "'View all'",
        "t('dashboard.view_all')"
    )

    with open('src/app/dashboard/page.tsx', 'w', encoding='utf-8') as f:
        f.write(dashboard)
    print('Dashboard page updated with translations')
else:
    print('Dashboard already has useLanguage')

print('All i18n files written successfully')