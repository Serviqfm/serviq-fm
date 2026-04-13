import os

# ── Complete rewrite of work orders list page ──
with open('src/app/dashboard/work-orders/page.tsx', 'r', encoding='utf-8') as f:
    wo = f.read()

# Fix page title
wo = wo.replace(
    "<h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>Work Orders</h1>",
    "<h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>{t('wo.title')}</h1>"
)
wo = wo.replace(
    "<h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>{t('wo.title')}{t('wo.title')}</h1>",
    "<h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>{t('wo.title')}</h1>"
)

# Fix search placeholder
wo = wo.replace(
    "placeholder='Search by title, asset, or site'",
    "placeholder={t('wo.search')}"
)
wo = wo.replace(
    "placeholder='...Search by title, asset, or site'",
    "placeholder={t('wo.search')}"
)

# Fix status filter buttons - they are rendered in a loop or individually
for old, key in [
    (">Closed<", "wo.status.closed"),
    (">Completed<", "wo.status.completed"),
    (">On Hold<", "wo.status.on_hold"),
    (">In Progress<", "wo.status.in_progress"),
    (">Assigned<", "wo.status.assigned"),
    (">New<", "wo.status.new"),
]:
    wo = wo.replace(old, ">{t('" + key + "')}<")

# Fix priority buttons
for old, key in [
    (">Critical<", "wo.priority.critical"),
    (">High<", "wo.priority.high"),
    (">Medium<", "wo.priority.medium"),
    (">Low<", "wo.priority.low"),
]:
    wo = wo.replace(old, ">{t('" + key + "')}<")

# Fix All and All Priorities buttons
wo = wo.replace(">All Priorities<", ">{t('filter.all_priorities')}<")
wo = wo.replace(
    "value='all'>All Technicians",
    "value='all'>{t('filter.all_techs')}"
)
wo = wo.replace(
    "value='all'>All Categories",
    "value='all'>{t('filter.all_cats')}"
)

# Fix column headers array
wo = wo.replace(
    "['Title','Asset','Assigned To','Priority','Status','Due Date','Site','Created','Actions']",
    "[t('wo.col.title'),t('wo.col.asset'),t('wo.col.assigned'),t('wo.col.priority'),t('wo.col.status'),t('wo.col.due'),t('wo.col.site'),t('common.created'),t('common.actions')]"
)

# Fix Unassigned text
wo = wo.replace(
    "assignee?.full_name ?? 'Unassigned'",
    "assignee?.full_name ?? t('common.unassigned')"
)
wo = wo.replace(
    "'Unassigned'",
    "t('common.unassigned')"
)

with open('src/app/dashboard/work-orders/page.tsx', 'w', encoding='utf-8') as f:
    f.write(wo)
print('Work orders page fixed')

# ── Fix Assets page ──
with open('src/app/dashboard/assets/page.tsx', 'r', encoding='utf-8') as f:
    assets = f.read()

assets = assets.replace(
    "<h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>Assets</h1>",
    "<h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>{t('assets.title')}</h1>"
)
assets = assets.replace(
    "placeholder='Search by name, serial number, manufacturer, or site'",
    "placeholder={t('assets.search')}"
)
assets = assets.replace(
    "placeholder='...Search by name, serial number, manufacturer, or site'",
    "placeholder={t('assets.search')}"
)

# Status filter buttons
for old, key in [
    (">Retired<", "assets.status.retired"),
    (">Under Maintenance<", "assets.status.under_maintenance"),
    (">Active<", "assets.status.active"),
    (">All Status<", "common.all"),
]:
    assets = assets.replace(old, ">{t('" + key + "')}<")

# Export button text
assets = assets.replace(">Export<", ">{t('btn.export')}<")

with open('src/app/dashboard/assets/page.tsx', 'w', encoding='utf-8') as f:
    f.write(assets)
print('Assets page fixed')

# ── Fix PM Schedules page ──
with open('src/app/dashboard/pm-schedules/page.tsx', 'r', encoding='utf-8') as f:
    pm = f.read()

pm = pm.replace(
    "<h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>PM Schedules</h1>",
    "<h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>{t('pm.title')}</h1>"
)
pm = pm.replace(">Calendar<", ">{t('pm.calendar')}<")
pm = pm.replace(">Compliance<", ">{t('pm.compliance')}<")
pm = pm.replace(">Pause<", ">{t('pm.pause')}<")
pm = pm.replace(">Resume<", ">{t('pm.resume')}<")
pm = pm.replace(">Generate WO<", ">{t('pm.generate')}<")
pm = pm.replace(
    "assignee?.full_name ?? 'Unassigned'",
    "assignee?.full_name ?? t('common.unassigned')"
)

with open('src/app/dashboard/pm-schedules/page.tsx', 'w', encoding='utf-8') as f:
    f.write(pm)
print('PM schedules page fixed')

# ── Fix Inspections page ──
with open('src/app/dashboard/inspections/page.tsx', 'r', encoding='utf-8') as f:
    insp = f.read()

insp = insp.replace(
    "<h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>Inspections</h1>",
    "<h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>{t('insp.title')}</h1>"
)

with open('src/app/dashboard/inspections/page.tsx', 'w', encoding='utf-8') as f:
    f.write(insp)
print('Inspections page fixed')

# ── Fix Inventory page ──
with open('src/app/dashboard/inventory/page.tsx', 'r', encoding='utf-8') as f:
    inv = f.read()

inv = inv.replace(
    "<h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>Inventory</h1>",
    "<h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>{t('inv.title')}</h1>"
)
inv = inv.replace(
    "placeholder='Search by name, SKU, or category...'",
    "placeholder={t('inv.search')}"
)
inv = inv.replace(">In Stock<", ">{t('inv.status.in')}<")
inv = inv.replace(">Low Stock<", ">{t('inv.status.low')}<")
inv = inv.replace(">Out of Stock<", ">{t('inv.status.out')}<")
inv = inv.replace("'Out of Stock'", "t('inv.status.out')")
inv = inv.replace("'Low Stock'", "t('inv.status.low')")
inv = inv.replace("'In Stock'", "t('inv.status.in')")

with open('src/app/dashboard/inventory/page.tsx', 'w', encoding='utf-8') as f:
    f.write(inv)
print('Inventory page fixed')

# ── Fix Vendors page ──
with open('src/app/dashboard/vendors/page.tsx', 'r', encoding='utf-8') as f:
    ven = f.read()

ven = ven.replace(
    "<h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>Vendors</h1>",
    "<h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>{t('vendors.title')}</h1>"
)
ven = ven.replace(
    "placeholder='Search by company name, contact, or specialisation...'",
    "placeholder={t('vendors.search')}"
)
ven = ven.replace(">Active<", ">{t('common.active')}<")
ven = ven.replace(">Inactive<", ">{t('common.inactive')}<")
ven = ven.replace("'Active'", "t('common.active')")
ven = ven.replace("'Inactive'", "t('common.inactive')")
ven = ven.replace("? 'Deactivate' : 'Activate'", "? t('common.deactivate') : t('common.activate')")

with open('src/app/dashboard/vendors/page.tsx', 'w', encoding='utf-8') as f:
    f.write(ven)
print('Vendors page fixed')

# ── Fix Users page ──
with open('src/app/dashboard/users/page.tsx', 'r', encoding='utf-8') as f:
    usr = f.read()

usr = usr.replace(
    "<h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>Users</h1>",
    "<h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>{t('users.title')}</h1>"
)
usr = usr.replace("u.is_active !== false ? 'Active' : 'Inactive'", "u.is_active !== false ? t('common.active') : t('common.inactive')")
usr = usr.replace("? 'Deactivate' : 'Activate'", "? t('common.deactivate') : t('common.activate')")

with open('src/app/dashboard/users/page.tsx', 'w', encoding='utf-8') as f:
    f.write(usr)
print('Users page fixed')

# ── Add missing translation keys ──
with open('src/context/LanguageContext.tsx', 'r', encoding='utf-8') as f:
    ctx = f.read()

if "'common.unassigned'" not in ctx:
    ctx = ctx.replace(
        "  'common.confirm_delete': 'Are you sure you want to delete this?',",
        "  'common.confirm_delete': 'Are you sure you want to delete this?',\n  'common.unassigned': 'Unassigned',\n  'common.created': 'Created',"
    )
    ctx = ctx.replace(
        "  'common.confirm_delete': 'هل أنت متأكد من حذف هذا العنصر؟',",
        "  'common.confirm_delete': 'هل أنت متأكد من حذف هذا العنصر؟',\n  'common.unassigned': 'غير معيَّن',\n  'common.created': 'تاريخ الإنشاء',"
    )
    with open('src/context/LanguageContext.tsx', 'w', encoding='utf-8') as f:
        f.write(ctx)
    print('Translation keys added')

print('All fixes complete')