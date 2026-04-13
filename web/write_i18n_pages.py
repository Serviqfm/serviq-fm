import os

pages = [
    'src/app/dashboard/work-orders/page.tsx',
    'src/app/dashboard/assets/page.tsx',
    'src/app/dashboard/pm-schedules/page.tsx',
    'src/app/dashboard/inspections/page.tsx',
    'src/app/dashboard/inventory/page.tsx',
    'src/app/dashboard/vendors/page.tsx',
    'src/app/dashboard/users/page.tsx',
]

# Replacements for each page
replacements = {
    'src/app/dashboard/work-orders/page.tsx': [
        ("import Link from 'next/link'", "import Link from 'next/link'\nimport { useLanguage } from '@/context/LanguageContext'"),
        ("  const supabase = createClient()", "  const supabase = createClient()\n  const { t } = useLanguage()"),
        ("'Work Orders'", "t('wo.title')"),
        ("'+ New Work Order'", "t('wo.new')"),
        ("'Search work orders...'", "t('wo.search')"),
        ("'Title'", "t('wo.col.title')"),
        ("'Asset'", "t('wo.col.asset')"),
        ("'Assigned To'", "t('wo.col.assigned')"),
        ("'Priority'", "t('wo.col.priority')"),
        ("'Status'", "t('wo.col.status')"),
        ("'Due Date'", "t('wo.col.due')"),
        ("'Site'", "t('wo.col.site')"),
        ("'Actions'", "t('wo.col.actions')"),
        ("'Overdue'", "t('wo.overdue')"),
        ("'Edit'", "t('common.edit')"),
        ("'Delete'", "t('common.delete')"),
        ("'View'", "t('common.view')"),
    ],
    'src/app/dashboard/assets/page.tsx': [
        ("import Link from 'next/link'", "import Link from 'next/link'\nimport { useLanguage } from '@/context/LanguageContext'"),
        ("  const supabase = createClient()", "  const supabase = createClient()\n  const { t } = useLanguage()"),
        ("'Assets'", "t('assets.title')"),
        ("'+ Add Asset'", "t('assets.new')"),
        ("'Search assets...'", "t('assets.search')"),
        ("'Import CSV'", "t('assets.import')"),
        ("'Export'", "t('assets.export')"),
        ("'Asset Name'", "t('assets.col.name')"),
        ("'Category'", "t('assets.col.cat')"),
        ("'Serial Number'", "t('assets.col.serial')"),
        ("'Warranty Expiry'", "t('assets.col.warranty')"),
        ("'Added'", "t('assets.col.added')"),
        ("'No assets yet'", "t('assets.no_assets')"),
        ("'Edit'", "t('common.edit')"),
        ("'Delete'", "t('common.delete')"),
    ],
    'src/app/dashboard/pm-schedules/page.tsx': [
        ("import Link from 'next/link'", "import Link from 'next/link'\nimport { useLanguage } from '@/context/LanguageContext'"),
        ("  const supabase = createClient()", "  const supabase = createClient()\n  const { t } = useLanguage()"),
        ("'PM Schedules'", "t('pm.title')"),
        ("'+ New Schedule'", "t('pm.new')"),
        ("'Calendar'", "t('pm.calendar')"),
        ("'Compliance'", "t('pm.compliance')"),
        ("'Schedule'", "t('pm.col.schedule')"),
        ("'Frequency'", "t('pm.col.freq')"),
        ("'Next Due'", "t('pm.col.due')"),
        ("'Pause'", "t('pm.pause')"),
        ("'Resume'", "t('pm.resume')"),
        ("'Generate WO'", "t('pm.generate')"),
        ("'Edit'", "t('common.edit')"),
        ("'Delete'", "t('common.delete')"),
        ("'No PM schedules yet'", "t('pm.no_schedules')"),
    ],
    'src/app/dashboard/inspections/page.tsx': [
        ("import Link from 'next/link'", "import Link from 'next/link'\nimport { useLanguage } from '@/context/LanguageContext'"),
        ("  const supabase = createClient()", "  const supabase = createClient()\n  const { t } = useLanguage()"),
        ("'Inspections'", "t('insp.title')"),
        ("'+ Start Inspection'", "t('insp.new')"),
        ("'+ New Template'", "t('insp.new_template')"),
        ("'Template'", "t('insp.col.template')"),
        ("'Vertical'", "t('insp.col.vertical')"),
        ("'Conducted By'", "t('insp.col.by')"),
        ("'Result'", "t('insp.col.result')"),
        ("'View'", "t('common.view')"),
        ("'Delete'", "t('common.delete')"),
        ("'Use Template'", "t('insp.new')"),
        ("'Edit'", "t('common.edit')"),
    ],
    'src/app/dashboard/inventory/page.tsx': [
        ("import Link from 'next/link'", "import Link from 'next/link'\nimport { useLanguage } from '@/context/LanguageContext'"),
        ("  const supabase = createClient()", "  const supabase = createClient()\n  const { t } = useLanguage()"),
        ("'Inventory'", "t('inv.title')"),
        ("'+ Add Item'", "t('inv.new')"),
        ("'Search by name, SKU, or category...'", "t('inv.search')"),
        ("'Low Stock Alert'", "t('inv.low_stock')"),
        ("'Item Name'", "t('inv.col.name')"),
        ("'SKU'", "t('inv.col.sku')"),
        ("'Location'", "t('inv.col.location')"),
        ("'Stock'", "t('inv.col.stock')"),
        ("'Min Stock'", "t('inv.col.min')"),
        ("'Unit Cost'", "t('inv.col.cost')"),
        ("'In Stock'", "t('inv.status.in')"),
        ("'Low Stock'", "t('inv.status.low')"),
        ("'Out of Stock'", "t('inv.status.out')"),
        ("'Edit'", "t('common.edit')"),
        ("'Delete'", "t('common.delete')"),
    ],
    'src/app/dashboard/vendors/page.tsx': [
        ("import Link from 'next/link'", "import Link from 'next/link'\nimport { useLanguage } from '@/context/LanguageContext'"),
        ("  const supabase = createClient()", "  const supabase = createClient()\n  const { t } = useLanguage()"),
        ("'Vendors'", "t('vendors.title')"),
        ("'+ Add Vendor'", "t('vendors.new')"),
        ("'Search by company name, contact, or specialisation...'", "t('vendors.search')"),
        ("'Company'", "t('vendors.col.company')"),
        ("'Contact'", "t('vendors.col.contact')"),
        ("'Phone'", "t('vendors.col.phone')"),
        ("'Specialisation'", "t('vendors.col.spec')"),
        ("'Rating'", "t('vendors.col.rating')"),
        ("'View'", "t('common.view')"),
        ("'Edit'", "t('common.edit')"),
        ("'Activate'", "t('common.activate')"),
        ("'Deactivate'", "t('common.deactivate')"),
        ("'Delete'", "t('common.delete')"),
    ],
    'src/app/dashboard/users/page.tsx': [
        ("import Link from 'next/link'", "import Link from 'next/link'\nimport { useLanguage } from '@/context/LanguageContext'"),
        ("  const supabase = createClient()", "  const supabase = createClient()\n  const { t } = useLanguage()"),
        ("'Users'", "t('users.title')"),
        ("'+ Add User'", "t('users.new')"),
        ("'Name'", "t('users.col.name')"),
        ("'Email'", "t('users.col.email')"),
        ("'Role'", "t('users.col.role')"),
        ("'Last Active'", "t('users.col.active')"),
        ("'Edit'", "t('common.edit')"),
        ("'Activate'", "t('common.activate')"),
        ("'Deactivate'", "t('common.deactivate')"),
    ],
}

for path, changes in replacements.items():
    try:
        with open(path, 'r', encoding='utf-8') as f:
            content = f.read()

        # Skip if already translated
        if 'useLanguage' in content:
            print(f'SKIP (already translated): {path}')
            continue

        changed = 0
        for old, new in changes:
            if old in content:
                content = content.replace(old, new)
                changed += 1

        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f'OK ({changed} replacements): {path}')

    except FileNotFoundError:
        print(f'NOT FOUND: {path}')
    except Exception as e:
        print(f'ERROR {path}: {e}')

print('Done')