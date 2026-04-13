import os

# ── Translation utility component ──
os.makedirs('src/components', exist_ok=True)

translate_btn = """'use client'

import { useState } from 'react'

interface TranslateButtonProps {
  texts: Record<string, string>
  onTranslated: (translations: Record<string, string>) => void
  targetLang?: string
}

export default function TranslateButton({ texts, onTranslated, targetLang = 'ar' }: TranslateButtonProps) {
  const [translating, setTranslating] = useState(false)
  const [translated, setTranslated] = useState(false)

  async function translateAll() {
    setTranslating(true)
    const results: Record<string, string> = {}
    const keys = Object.keys(texts)
    for (const key of keys) {
      const text = texts[key]
      if (!text || text.trim() === '') { results[key] = text; continue }
      try {
        const url = 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(text) + '&langpair=en|' + targetLang
        const res = await fetch(url)
        const data = await res.json()
        results[key] = data?.responseData?.translatedText ?? text
        await new Promise(r => setTimeout(r, 100))
      } catch {
        results[key] = text
      }
    }
    onTranslated(results)
    setTranslated(true)
    setTranslating(false)
  }

  return (
    <button
      onClick={translateAll}
      disabled={translating}
      style={{
        padding: '6px 14px',
        borderRadius: 8,
        border: '1px solid #ddd',
        background: translated ? '#e8f5e9' : 'white',
        color: translated ? '#2e7d32' : '#666',
        cursor: translating ? 'not-allowed' : 'pointer',
        fontSize: 12,
        fontWeight: 500,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        opacity: translating ? 0.7 : 1,
      }}
    >
      <span>{translating ? '⟳' : '🌐'}</span>
      <span>{translating ? 'Translating...' : translated ? 'Translated to Arabic' : 'Translate to Arabic'}</span>
    </button>
  )
}"""

with open('src/components/TranslateButton.tsx', 'w', encoding='utf-8') as f:
    f.write(translate_btn)
print('TranslateButton component written')

# ── New Work Order page - full bilingual rewrite of form labels ──
with open('src/app/dashboard/work-orders/new/page.tsx', 'r', encoding='utf-8') as f:
    wo_new = f.read()

if 'useLanguage' not in wo_new:
    wo_new = wo_new.replace(
        "import { useRouter } from 'next/navigation'",
        "import { useRouter } from 'next/navigation'\nimport { useLanguage } from '@/context/LanguageContext'"
    )
    wo_new = wo_new.replace(
        "  const router = useRouter()",
        "  const router = useRouter()\n  const { t } = useLanguage()"
    )
    # Form labels
    wo_new = wo_new.replace("'Work Order Title *'", "t('wo.col.title') + ' *'")
    wo_new = wo_new.replace("'Description'", "t('common.description')")
    wo_new = wo_new.replace("'Priority *'", "t('wo.col.priority') + ' *'")
    wo_new = wo_new.replace("'Category'", "t('assets.col.cat')")
    wo_new = wo_new.replace("'Site'", "t('common.site')")
    wo_new = wo_new.replace("'Asset'", "t('common.asset')")
    wo_new = wo_new.replace("'Due Date'", "t('common.due_date')")
    wo_new = wo_new.replace("'Assign To'", "t('common.assign')")
    wo_new = wo_new.replace("'+ New Work Order'", "t('wo.new')")
    wo_new = wo_new.replace("'Create Work Order'", "t('wo.new')")
    wo_new = wo_new.replace("'Save Work Order'", "t('wo.new')")
    wo_new = wo_new.replace("'Cancel'", "t('common.cancel')")
    wo_new = wo_new.replace("'Creating...'", "t('common.saving')")
    with open('src/app/dashboard/work-orders/new/page.tsx', 'w', encoding='utf-8') as f:
        f.write(wo_new)
    print('WO new page updated')

# ── Asset new page ──
with open('src/app/dashboard/assets/new/page.tsx', 'r', encoding='utf-8') as f:
    asset_new = f.read()

if 'useLanguage' not in asset_new:
    asset_new = asset_new.replace(
        "import { useRouter } from 'next/navigation'",
        "import { useRouter } from 'next/navigation'\nimport { useLanguage } from '@/context/LanguageContext'"
    )
    asset_new = asset_new.replace(
        "  const router = useRouter()",
        "  const router = useRouter()\n  const { t } = useLanguage()"
    )
    asset_new = asset_new.replace("'Asset Name *'", "t('assets.col.name') + ' *'")
    asset_new = asset_new.replace("'Category'", "t('assets.col.cat')")
    asset_new = asset_new.replace("'Site'", "t('common.site')")
    asset_new = asset_new.replace("'Description'", "t('common.description')")
    asset_new = asset_new.replace("'Cancel'", "t('common.cancel')")
    asset_new = asset_new.replace("'Saving...'", "t('common.saving')")
    asset_new = asset_new.replace("'Save Asset'", "t('common.save')")
    asset_new = asset_new.replace("'Add New Asset'", "t('assets.new')")
    with open('src/app/dashboard/assets/new/page.tsx', 'w', encoding='utf-8') as f:
        f.write(asset_new)
    print('Asset new page updated')

# ── PM New page ──
with open('src/app/dashboard/pm-schedules/new/page.tsx', 'r', encoding='utf-8') as f:
    pm_new = f.read()

if 'useLanguage' not in pm_new:
    pm_new = pm_new.replace(
        "import { useRouter } from 'next/navigation'",
        "import { useRouter } from 'next/navigation'\nimport { useLanguage } from '@/context/LanguageContext'"
    )
    pm_new = pm_new.replace(
        "  const router = useRouter()",
        "  const router = useRouter()\n  const { t } = useLanguage()"
    )
    pm_new = pm_new.replace("'New PM Schedule'", "t('pm.new')")
    pm_new = pm_new.replace("'Title *'", "t('common.name') + ' *'")
    pm_new = pm_new.replace("'Description'", "t('common.description')")
    pm_new = pm_new.replace("'Frequency *'", "t('pm.col.freq') + ' *'")
    pm_new = pm_new.replace("'Asset'", "t('common.asset')")
    pm_new = pm_new.replace("'Site'", "t('common.site')")
    pm_new = pm_new.replace("'Assign To'", "t('common.assign')")
    pm_new = pm_new.replace("'Cancel'", "t('common.cancel')")
    pm_new = pm_new.replace("'Saving...'", "t('common.saving')")
    pm_new = pm_new.replace("'Save Schedule'", "t('common.save')")
    with open('src/app/dashboard/pm-schedules/new/page.tsx', 'w', encoding='utf-8') as f:
        f.write(pm_new)
    print('PM new page updated')

# ── Inventory new page ──
with open('src/app/dashboard/inventory/new/page.tsx', 'r', encoding='utf-8') as f:
    inv_new = f.read()

if 'useLanguage' not in inv_new:
    inv_new = inv_new.replace(
        "import { useRouter } from 'next/navigation'",
        "import { useRouter } from 'next/navigation'\nimport { useLanguage } from '@/context/LanguageContext'"
    )
    inv_new = inv_new.replace(
        "  const router = useRouter()",
        "  const router = useRouter()\n  const { t } = useLanguage()"
    )
    inv_new = inv_new.replace("'Add Inventory Item'", "t('inv.new')")
    inv_new = inv_new.replace("'Item Name (English) *'", "t('inv.col.name') + ' *'")
    inv_new = inv_new.replace("'Category'", "t('assets.col.cat')")
    inv_new = inv_new.replace("'Site'", "t('common.site')")
    inv_new = inv_new.replace("'Cancel'", "t('common.cancel')")
    inv_new = inv_new.replace("'Saving...'", "t('common.saving')")
    inv_new = inv_new.replace("'Save Item'", "t('common.save')")
    with open('src/app/dashboard/inventory/new/page.tsx', 'w', encoding='utf-8') as f:
        f.write(inv_new)
    print('Inventory new page updated')

# ── Vendor new page ──
with open('src/app/dashboard/vendors/new/page.tsx', 'r', encoding='utf-8') as f:
    ven_new = f.read()

if 'useLanguage' not in ven_new:
    ven_new = ven_new.replace(
        "import { useRouter } from 'next/navigation'",
        "import { useRouter } from 'next/navigation'\nimport { useLanguage } from '@/context/LanguageContext'"
    )
    ven_new = ven_new.replace(
        "  const router = useRouter()",
        "  const router = useRouter()\n  const { t } = useLanguage()"
    )
    ven_new = ven_new.replace("'Add Vendor'", "t('vendors.new')")
    ven_new = ven_new.replace("'Add New Vendor'", "t('vendors.new')")
    ven_new = ven_new.replace("'Cancel'", "t('common.cancel')")
    ven_new = ven_new.replace("'Saving...'", "t('common.saving')")
    ven_new = ven_new.replace("'Save Vendor'", "t('common.save')")
    with open('src/app/dashboard/vendors/new/page.tsx', 'w', encoding='utf-8') as f:
        f.write(ven_new)
    print('Vendor new page updated')

# ── Users new page ──
with open('src/app/dashboard/users/new/page.tsx', 'r', encoding='utf-8') as f:
    usr_new = f.read()

if 'useLanguage' not in usr_new:
    usr_new = usr_new.replace(
        "import { useRouter } from 'next/navigation'",
        "import { useRouter } from 'next/navigation'\nimport { useLanguage } from '@/context/LanguageContext'"
    )
    usr_new = usr_new.replace(
        "  const router = useRouter()",
        "  const router = useRouter()\n  const { t } = useLanguage()"
    )
    usr_new = usr_new.replace("'Add New User'", "t('users.new')")
    usr_new = usr_new.replace("'Creating User...'", "t('common.saving')")
    usr_new = usr_new.replace("'Create User'", "t('common.save')")
    usr_new = usr_new.replace("'Full Name (English) *'", "t('users.col.name') + ' *'")
    usr_new = usr_new.replace("'Email Address *'", "t('users.col.email') + ' *'")
    usr_new = usr_new.replace("'Role *'", "t('users.col.role') + ' *'")
    with open('src/app/dashboard/users/new/page.tsx', 'w', encoding='utf-8') as f:
        f.write(usr_new)
    print('Users new page updated')

# ── Add translate button to WO detail page ──
with open('src/app/dashboard/work-orders/[id]/page.tsx', 'r', encoding='utf-8') as f:
    wo_detail = f.read()

if 'TranslateButton' not in wo_detail:
    wo_detail = wo_detail.replace(
        "import Link from 'next/link'",
        "import Link from 'next/link'\nimport TranslateButton from '@/components/TranslateButton'\nimport { useLanguage } from '@/context/LanguageContext'"
    )
    # Add translation state
    wo_detail = wo_detail.replace(
        "  const [activeTab, setActiveTab]",
        "  const { lang } = useLanguage()\n  const [translatedWO, setTranslatedWO] = useState<Record<string,string>>({})\n  const [activeTab, setActiveTab]"
    )
    # Add translate button next to the title
    wo_detail = wo_detail.replace(
        "        <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>{wo.title}</h1>",
        """        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>{translatedWO.title ?? wo.title}</h1>
          {lang === 'ar' && (
            <TranslateButton
              texts={{ title: wo.title, description: wo.description ?? '' }}
              onTranslated={setTranslatedWO}
            />
          )}
        </div>
        {translatedWO.description && lang === 'ar' && (
          <p style={{ fontSize: 13, color: '#666', margin: '6px 0 0', direction: 'rtl', background: '#f9f9f9', padding: '8px 12px', borderRadius: 6 }}>
            {translatedWO.description}
          </p>
        )}"""
    )
    with open('src/app/dashboard/work-orders/[id]/page.tsx', 'w', encoding='utf-8') as f:
        f.write(wo_detail)
    print('WO detail translate button added')

# ── Add translate button to Asset detail page ──
with open('src/app/dashboard/assets/[id]/page.tsx', 'r', encoding='utf-8') as f:
    asset_detail = f.read()

if 'TranslateButton' not in asset_detail:
    asset_detail = asset_detail.replace(
        "import Link from 'next/link'",
        "import Link from 'next/link'\nimport TranslateButton from '@/components/TranslateButton'\nimport { useLanguage } from '@/context/LanguageContext'"
    )
    asset_detail = asset_detail.replace(
        "  const [activeTab, setActiveTab]",
        "  const { lang } = useLanguage()\n  const [translatedAsset, setTranslatedAsset] = useState<Record<string,string>>({})\n  const [activeTab, setActiveTab]"
    )
    asset_detail = asset_detail.replace(
        "        <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>{asset.name}</h1>",
        """        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>{translatedAsset.name ?? asset.name}</h1>
          {lang === 'ar' && (
            <TranslateButton
              texts={{ name: asset.name, description: asset.description ?? '' }}
              onTranslated={setTranslatedAsset}
            />
          )}
        </div>"""
    )
    with open('src/app/dashboard/assets/[id]/page.tsx', 'w', encoding='utf-8') as f:
        f.write(asset_detail)
    print('Asset detail translate button added')

# ── Add missing translation keys to LanguageContext ──
with open('src/context/LanguageContext.tsx', 'r', encoding='utf-8') as f:
    ctx = f.read()

# Add filter/button translations to English
extra_en = """  'filter.all_status': 'All Status',
  'filter.all_priorities': 'All Priorities',
  'filter.all_techs': 'All Technicians',
  'filter.all_cats': 'All Categories',
  'filter.all_sites': 'All Sites',
  'btn.new_wo': '+ New Work Order',
  'btn.add_asset': '+ Add Asset',
  'btn.export': 'Export',
  'btn.import': 'Import CSV',
  'btn.add_schedule': '+ New Schedule',
  'btn.add_vendor': '+ Add Vendor',
  'btn.add_item': '+ Add Item',
  'btn.add_user': '+ Add User',
  'btn.start_inspection': '+ Start Inspection',
  'btn.new_template': '+ New Template',
  'btn.save': 'Save Changes',
  'btn.cancel': 'Cancel',
  'btn.delete_selected': 'Delete Selected',
  'btn.bulk_assign': 'Bulk Assign',
  'wo.sla': 'SLA',
  'wo.comments': 'Comments',
  'wo.photos': 'Photos',
  'wo.history': 'History',
  'wo.parts': 'Parts Used',
  'wo.activity': 'Activity Log',
  'wo.sign_off': 'Sign Off',
  'wo.approve_close': 'Approve & Close',
  'wo.reopen': 'Reopen',
  'assets.qr': 'QR Code',
  'assets.pm_history': 'PM History',
  'assets.custom_fields': 'Custom Fields',
  'assets.decommission': 'Decommission Asset',
  'assets.lifecycle': 'Lifecycle Cost',"""

extra_ar = """  'filter.all_status': 'جميع الحالات',
  'filter.all_priorities': 'جميع الأولويات',
  'filter.all_techs': 'جميع الفنيين',
  'filter.all_cats': 'جميع الفئات',
  'filter.all_sites': 'جميع المواقع',
  'btn.new_wo': '+ أمر عمل جديد',
  'btn.add_asset': '+ إضافة أصل',
  'btn.export': 'تصدير',
  'btn.import': 'استيراد CSV',
  'btn.add_schedule': '+ جدول جديد',
  'btn.add_vendor': '+ إضافة مورد',
  'btn.add_item': '+ إضافة عنصر',
  'btn.add_user': '+ إضافة مستخدم',
  'btn.start_inspection': '+ بدء تفتيش',
  'btn.new_template': '+ نموذج جديد',
  'btn.save': 'حفظ التغييرات',
  'btn.cancel': 'إلغاء',
  'btn.delete_selected': 'حذف المحدد',
  'btn.bulk_assign': 'تعيين جماعي',
  'wo.sla': 'اتفاقية مستوى الخدمة',
  'wo.comments': 'التعليقات',
  'wo.photos': 'الصور',
  'wo.history': 'السجل',
  'wo.parts': 'القطع المستخدمة',
  'wo.activity': 'سجل النشاط',
  'wo.sign_off': 'التوقيع',
  'wo.approve_close': 'موافقة وإغلاق',
  'wo.reopen': 'إعادة فتح',
  'assets.qr': 'رمز QR',
  'assets.pm_history': 'سجل الصيانة',
  'assets.custom_fields': 'حقول مخصصة',
  'assets.decommission': 'إيقاف تشغيل الأصل',
  'assets.lifecycle': 'تكلفة دورة الحياة',"""

if "'filter.all_status'" not in ctx:
    ctx = ctx.replace(
        "  'common.confirm_delete': 'Are you sure you want to delete this?',\n  'dashboard.pm_compliance_btn': 'PM Compliance',\n  'lang': 'en',",
        "  'common.confirm_delete': 'Are you sure you want to delete this?',\n  'dashboard.pm_compliance_btn': 'PM Compliance',\n  'lang': 'en',\n" + extra_en
    )
    ctx = ctx.replace(
        "  'common.confirm_delete': 'هل أنت متأكد من حذف هذا العنصر؟',\n  'dashboard.pm_compliance_btn': 'الالتزام بالصيانة',\n  'lang': 'ar',",
        "  'common.confirm_delete': 'هل أنت متأكد من حذف هذا العنصر؟',\n  'dashboard.pm_compliance_btn': 'الالتزام بالصيانة',\n  'lang': 'ar',\n" + extra_ar
    )
    with open('src/context/LanguageContext.tsx', 'w', encoding='utf-8') as f:
        f.write(ctx)
    print('Translation context updated with extra keys')
else:
    print('Extra keys already present')

# ── Update WO list page buttons with new keys ──
with open('src/app/dashboard/work-orders/page.tsx', 'r', encoding='utf-8') as f:
    wo_list = f.read()

wo_list_replacements = [
    ("'All Technicians'", "t('filter.all_techs')"),
    ("'All Categories'", "t('filter.all_cats')"),
    ("'All Priorities'", "t('filter.all_priorities')"),
    ("'+ New Work Order'", "t('btn.new_wo')"),
    ("'Bulk Assign'", "t('btn.bulk_assign')"),
    ("'Delete Selected'", "t('btn.delete_selected')"),
]
for old, new in wo_list_replacements:
    if old in wo_list:
        wo_list = wo_list.replace(old, new)

with open('src/app/dashboard/work-orders/page.tsx', 'w', encoding='utf-8') as f:
    f.write(wo_list)
print('WO list buttons updated')

# ── Update Assets list page buttons ──
with open('src/app/dashboard/assets/page.tsx', 'r', encoding='utf-8') as f:
    assets_list = f.read()

assets_list_replacements = [
    ("'+ Add Asset'", "t('btn.add_asset')"),
    ("'Import CSV'", "t('btn.import')"),
    ("'Export'", "t('btn.export')"),
    ("'Delete Selected'", "t('btn.delete_selected')"),
    ("'All Categories'", "t('filter.all_cats')"),
]
for old, new in assets_list_replacements:
    if old in assets_list:
        assets_list = assets_list.replace(old, new)

with open('src/app/dashboard/assets/page.tsx', 'w', encoding='utf-8') as f:
    f.write(assets_list)
print('Assets list buttons updated')

# ── Update PM list buttons ──
with open('src/app/dashboard/pm-schedules/page.tsx', 'r', encoding='utf-8') as f:
    pm_list = f.read()

pm_replacements = [
    ("'+ New Schedule'", "t('btn.add_schedule')"),
    ("'Delete Selected'", "t('btn.delete_selected')"),
]
for old, new in pm_replacements:
    if old in pm_list:
        pm_list = pm_list.replace(old, new)

with open('src/app/dashboard/pm-schedules/page.tsx', 'w', encoding='utf-8') as f:
    f.write(pm_list)
print('PM list buttons updated')

# ── Update Inventory list buttons ──
with open('src/app/dashboard/inventory/page.tsx', 'r', encoding='utf-8') as f:
    inv_list = f.read()

inv_replacements = [
    ("'+ Add Item'", "t('btn.add_item')"),
    ("'Delete Selected'", "t('btn.delete_selected')"),
]
for old, new in inv_replacements:
    if old in inv_list:
        inv_list = inv_list.replace(old, new)

with open('src/app/dashboard/inventory/page.tsx', 'w', encoding='utf-8') as f:
    f.write(inv_list)
print('Inventory list buttons updated')

# ── Update Vendors list buttons ──
with open('src/app/dashboard/vendors/page.tsx', 'r', encoding='utf-8') as f:
    ven_list = f.read()

ven_replacements = [
    ("'+ Add Vendor'", "t('btn.add_vendor')"),
    ("'Delete Selected'", "t('btn.delete_selected')"),
]
for old, new in ven_replacements:
    if old in ven_list:
        ven_list = ven_list.replace(old, new)

with open('src/app/dashboard/vendors/page.tsx', 'w', encoding='utf-8') as f:
    f.write(ven_list)
print('Vendors list buttons updated')

# ── Update Inspections list buttons ──
with open('src/app/dashboard/inspections/page.tsx', 'r', encoding='utf-8') as f:
    insp_list = f.read()

insp_replacements = [
    ("'+ Start Inspection'", "t('btn.start_inspection')"),
    ("'+ New Template'", "t('btn.new_template')"),
    ("'Delete Selected'", "t('btn.delete_selected')"),
]
for old, new in insp_replacements:
    if old in insp_list:
        insp_list = insp_list.replace(old, new)

with open('src/app/dashboard/inspections/page.tsx', 'w', encoding='utf-8') as f:
    f.write(insp_list)
print('Inspections list buttons updated')

# ── Update Users list buttons ──
with open('src/app/dashboard/users/page.tsx', 'r', encoding='utf-8') as f:
    usr_list = f.read()

usr_replacements = [
    ("'+ Add User'", "t('btn.add_user')"),
]
for old, new in usr_replacements:
    if old in usr_list:
        usr_list = usr_list.replace(old, new)

with open('src/app/dashboard/users/page.tsx', 'w', encoding='utf-8') as f:
    f.write(usr_list)
print('Users list buttons updated')

# ── Update WO detail page tabs ──
with open('src/app/dashboard/work-orders/[id]/page.tsx', 'r', encoding='utf-8') as f:
    wo_det = f.read()

wo_det_replacements = [
    ("'Comments'", "t('wo.comments')"),
    ("'Photos'", "t('wo.photos')"),
    ("'Parts Used'", "t('wo.parts')"),
    ("'Approve & Close'", "t('wo.approve_close')"),
    ("'Reopen'", "t('wo.reopen')"),
]
for old, new in wo_det_replacements:
    if old in wo_det:
        wo_det = wo_det.replace(old, new)

with open('src/app/dashboard/work-orders/[id]/page.tsx', 'w', encoding='utf-8') as f:
    f.write(wo_det)
print('WO detail tabs updated')

# ── Update Asset detail page tabs ──
with open('src/app/dashboard/assets/[id]/page.tsx', 'r', encoding='utf-8') as f:
    ast_det = f.read()

ast_det_replacements = [
    ("'QR Code'", "t('assets.qr')"),
    ("'Custom Fields'", "t('assets.custom_fields')"),
    ("'Decommission Asset'", "t('assets.decommission')"),
]
for old, new in ast_det_replacements:
    if old in ast_det:
        ast_det = ast_det.replace(old, new)

with open('src/app/dashboard/assets/[id]/page.tsx', 'w', encoding='utf-8') as f:
    f.write(ast_det)
print('Asset detail tabs updated')

print('\nAll translation updates complete')