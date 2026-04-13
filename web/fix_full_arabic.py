import os

# ── 1. Fix Sidebar to use translations ──
with open('src/components/Sidebar.tsx', 'r', encoding='utf-8') as f:
    sidebar = f.read()

# Replace hardcoded nav labels with t() calls
nav_replacements = [
    ("label: 'Dashboard'", "label: t('nav.dashboard')"),
    ("label: 'Work Orders'", "label: t('nav.workorders')"),
    ("label: 'Assets'", "label: t('nav.assets')"),
    ("label: 'PM Schedules'", "label: t('nav.pm')"),
    ("label: 'Sites'", "label: t('nav.sites')"),
    ("label: 'Vendors'", "label: t('nav.vendors')"),
    ("label: 'Inspections'", "label: t('nav.inspections')"),
    ("label: 'Inventory'", "label: t('nav.inventory')"),
    ("label: 'Users'", "label: t('nav.users')"),
]

for old, new in nav_replacements:
    if old in sidebar:
        sidebar = sidebar.replace(old, new)
        print(f'Sidebar: replaced {old}')

with open('src/components/Sidebar.tsx', 'w', encoding='utf-8') as f:
    f.write(sidebar)
print('Sidebar nav labels updated')

# ── 2. Fix Work Orders page - full replacement of column headers and buttons ──
with open('src/app/dashboard/work-orders/page.tsx', 'r', encoding='utf-8') as f:
    wo = f.read()

wo_replacements = [
    # Column headers that map to table - these are in array form
    ("'Title','Asset','Assigned To','Priority','Status','Due Date','Site','Created','Actions'",
     "t('wo.col.title'),t('wo.col.asset'),t('wo.col.assigned'),t('wo.col.priority'),t('wo.col.status'),t('wo.col.due'),t('wo.col.site'),'Created',t('wo.col.actions')"),
    # Status filter buttons
    (">New<", ">{t('wo.status.new')}<"),
    (">Assigned<", ">{t('wo.status.assigned')}<"),
    (">In Progress<", ">{t('wo.status.in_progress')}<"),
    (">On Hold<", ">{t('wo.status.on_hold')}<"),
    (">Completed<", ">{t('wo.status.completed')}<"),
    (">Closed<", ">{t('wo.status.closed')}<"),
    (">All<", ">{t('common.all')}<"),
    # Priority buttons
    (">Critical<", ">{t('wo.priority.critical')}<"),
    (">High<", ">{t('wo.priority.high')}<"),
    (">Medium<", ">{t('wo.priority.medium')}<"),
    (">Low<", ">{t('wo.priority.low')}<"),
    (">All Priorities<", ">{t('common.all')}<"),
    # Action buttons
    ("'>View</button>", ">{t('common.view')}</button>"),
    ("'>Edit</button>", ">{t('common.edit')}</button>"),
    ("'>Delete</button>", ">{t('common.delete')}</button>"),
]

for old, new in wo_replacements:
    if old in wo:
        wo = wo.replace(old, new)

with open('src/app/dashboard/work-orders/page.tsx', 'w', encoding='utf-8') as f:
    f.write(wo)
print('Work orders page updated')

# ── 3. Fix Assets page columns ──
with open('src/app/dashboard/assets/page.tsx', 'r', encoding='utf-8') as f:
    assets = f.read()

assets_replacements = [
    ("'Asset Name','Category','Site','Serial Number','Status','Warranty Expiry','Added','Actions'",
     "t('assets.col.name'),t('assets.col.cat'),t('wo.col.site'),t('assets.col.serial'),t('common.status'),t('assets.col.warranty'),t('assets.col.added'),t('common.actions')"),
    (">Active<", ">{t('assets.status.active')}<"),
    (">Under Maintenance<", ">{t('assets.status.under_maintenance')}<"),
    (">Retired<", ">{t('assets.status.retired')}<"),
    (">All Status<", ">{t('common.all')}<"),
    (">Edit</button>", ">{t('common.edit')}</button>"),
    (">Delete</button>", ">{t('common.delete')}</button>"),
]

for old, new in assets_replacements:
    if old in assets:
        assets = assets.replace(old, new)

with open('src/app/dashboard/assets/page.tsx', 'w', encoding='utf-8') as f:
    f.write(assets)
print('Assets page updated')

# ── 4. Fix PM Schedules columns ──
with open('src/app/dashboard/pm-schedules/page.tsx', 'r', encoding='utf-8') as f:
    pm = f.read()

pm_replacements = [
    ("'Schedule','Asset','Frequency','Assigned To','Next Due','Compliance','Status','Actions'",
     "t('pm.col.schedule'),t('pm.col.asset'),t('pm.col.freq'),t('pm.col.assigned'),t('pm.col.due'),t('pm.compliance'),t('common.status'),t('common.actions')"),
    (">Edit</button>", ">{t('common.edit')}</button>"),
    (">Delete</button>", ">{t('common.delete')}</button>"),
    ("Generate WO'", "t('pm.generate')'"),
]

for old, new in pm_replacements:
    if old in pm:
        pm = pm.replace(old, new)

with open('src/app/dashboard/pm-schedules/page.tsx', 'w', encoding='utf-8') as f:
    f.write(pm)
print('PM schedules page updated')

# ── 5. Fix Inspections columns ──
with open('src/app/dashboard/inspections/page.tsx', 'r', encoding='utf-8') as f:
    insp = f.read()

insp_replacements = [
    ("'Template','Vertical','Site','Asset','Conducted By','Result','Status','Date','Actions'",
     "t('insp.col.template'),t('insp.col.vertical'),t('insp.col.site'),t('insp.col.asset'),t('insp.col.by'),t('insp.col.result'),t('common.status'),t('common.date'),t('common.actions')"),
    (">View</button>", ">{t('common.view')}</button>"),
    (">Delete</button>", ">{t('common.delete')}</button>"),
    (">Edit</button>", ">{t('common.edit')}</button>"),
    (">Use Template</button>", ">{t('insp.new')}</button>"),
]

for old, new in insp_replacements:
    if old in insp:
        insp = insp.replace(old, new)

with open('src/app/dashboard/inspections/page.tsx', 'w', encoding='utf-8') as f:
    f.write(insp)
print('Inspections page updated')

# ── 6. Fix Inventory columns ──
with open('src/app/dashboard/inventory/page.tsx', 'r', encoding='utf-8') as f:
    inv = f.read()

inv_replacements = [
    ("'Item Name','SKU','Category','Location','Stock','Min Stock','Unit Cost','Status','Actions'",
     "t('inv.col.name'),t('inv.col.sku'),t('inv.col.cat'),t('inv.col.location'),t('inv.col.stock'),t('inv.col.min'),t('inv.col.cost'),t('common.status'),t('common.actions')"),
    (">Edit</button>", ">{t('common.edit')}</button>"),
    (">Delete</button>", ">{t('common.delete')}</button>"),
]

for old, new in inv_replacements:
    if old in inv:
        inv = inv.replace(old, new)

with open('src/app/dashboard/inventory/page.tsx', 'w', encoding='utf-8') as f:
    f.write(inv)
print('Inventory page updated')

# ── 7. Fix Vendors columns ──
with open('src/app/dashboard/vendors/page.tsx', 'r', encoding='utf-8') as f:
    vendors = f.read()

vendors_replacements = [
    ("'Company','Contact','Phone','Specialisation','Rating','Status','Actions'",
     "t('vendors.col.company'),t('vendors.col.contact'),t('vendors.col.phone'),t('vendors.col.spec'),t('vendors.col.rating'),t('common.status'),t('common.actions')"),
    (">View</button>", ">{t('common.view')}</button>"),
    (">Edit</button>", ">{t('common.edit')}</button>"),
    (">Delete</button>", ">{t('common.delete')}</button>"),
    ("? 'Deactivate' : 'Activate'", "? t('common.deactivate') : t('common.activate')"),
]

for old, new in vendors_replacements:
    if old in vendors:
        vendors = vendors.replace(old, new)

with open('src/app/dashboard/vendors/page.tsx', 'w', encoding='utf-8') as f:
    f.write(vendors)
print('Vendors page updated')

# ── 8. Fix Users columns ──
with open('src/app/dashboard/users/page.tsx', 'r', encoding='utf-8') as f:
    users = f.read()

users_replacements = [
    ("'Name','Email','Role','Status','Last Active','Actions'",
     "t('users.col.name'),t('users.col.email'),t('users.col.role'),t('common.status'),t('users.col.active'),t('common.actions')"),
    (">Edit</button>", ">{t('common.edit')}</button>"),
    ("? 'Deactivate' : 'Activate'", "? t('common.deactivate') : t('common.activate')"),
    ("'Active'", "t('common.active')"),
    ("'Inactive'", "t('common.inactive')"),
    ("u.is_active !== false ? 'Active' : 'Inactive'", "u.is_active !== false ? t('common.active') : t('common.inactive')"),
]

for old, new in users_replacements:
    if old in users:
        users = users.replace(old, new)

with open('src/app/dashboard/users/page.tsx', 'w', encoding='utf-8') as f:
    f.write(users)
print('Users page updated')

# ── 9. Fix Dashboard - remaining untranslated strings ──
with open('src/app/dashboard/page.tsx', 'r', encoding='utf-8') as f:
    dash = f.read()

dash_replacements = [
    ("'Open WOs by Status'", "t('lang') === 'ar' ? 'أوامر العمل المفتوحة حسب الحالة' : 'Open WOs by Status'"),
    ("'Open WOs by Priority'", "t('lang') === 'ar' ? 'أوامر العمل المفتوحة حسب الأولوية' : 'Open WOs by Priority'"),
    ("'+ New Work Order'", "t('dashboard.new_wo')"),
    ("'+ Add Asset'", "t('dashboard.add_asset')"),
    ("'+ New PM Schedule'", "t('dashboard.new_pm')"),
    ("'PM Compliance'", "t('dashboard.pm_compliance_btn')"),
    ("'Today'", "t('dashboard.today')"),
    ("'Tomorrow'", "t('dashboard.tomorrow')"),
]

for old, new in dash_replacements:
    if old in dash:
        dash = dash.replace(old, new)

with open('src/app/dashboard/page.tsx', 'w', encoding='utf-8') as f:
    f.write(dash)
print('Dashboard page updated')

# ── 10. Add missing translation keys ──
with open('src/context/LanguageContext.tsx', 'r', encoding='utf-8') as f:
    ctx = f.read()

# Add missing keys to English
ctx = ctx.replace(
    "  'common.confirm_delete': 'Are you sure you want to delete this?',",
    """  'common.confirm_delete': 'Are you sure you want to delete this?',
  'dashboard.pm_compliance_btn': 'PM Compliance',
  'lang': 'en',"""
)

# Add missing keys to Arabic
ctx = ctx.replace(
    "  'common.confirm_delete': 'هل أنت متأكد من حذف هذا العنصر؟',",
    """  'common.confirm_delete': 'هل أنت متأكد من حذف هذا العنصر؟',
  'dashboard.pm_compliance_btn': 'الالتزام بالصيانة',
  'lang': 'ar',"""
)

with open('src/context/LanguageContext.tsx', 'w', encoding='utf-8') as f:
    f.write(ctx)
print('Translation keys updated')

print('\\nAll pages updated. Run npm run dev to test.')