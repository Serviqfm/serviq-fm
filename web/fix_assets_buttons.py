with open('src/app/dashboard/assets/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix status filter button labels
old_status = "s === 'all' ? 'All Status' : s.replace('_',' ').replace(/\\b\\w/g, (l: string) => l.toUpperCase())"
new_status = "s === 'all' ? t('common.all') : s === 'active' ? t('assets.status.active') : s === 'under_maintenance' ? t('assets.status.under_maintenance') : t('assets.status.retired')"

if old_status in content:
    content = content.replace(old_status, new_status)
    print('Status buttons fixed')
else:
    print('Status pattern not found')

# Fix category filter - categories are rendered as {c} directly
old_cat = "style={{ ...btnStyle(categoryFilter === c), fontSize: 12, padding: '4px 12px' }}>{c}</button>"
new_cat = """style={{ ...btnStyle(categoryFilter === c), fontSize: 12, padding: '4px 12px' }}>
              {c === 'all' ? t('common.all') : c === 'HVAC' ? t('cat.hvac') : c === 'Electrical' ? t('cat.electrical') : c === 'Plumbing' ? t('cat.plumbing') : c === 'Elevator / Lift' ? t('cat.elevator') : c === 'Fire Safety' ? t('cat.fire') : c === 'Furniture' ? t('cat.furniture') : c === 'Kitchen Equipment' ? t('cat.kitchen') : c === 'Pool / Gym' ? t('cat.pool') : c === 'IT Equipment' ? t('cat.it') : c === 'Signage' ? t('cat.signage') : c === 'Vehicle' ? t('cat.vehicle') : t('cat.other')}
            </button>"""

if old_cat in content:
    content = content.replace(old_cat, new_cat)
    print('Category buttons fixed')
else:
    print('Category pattern not found')

# Fix Export button
content = content.replace(
    "\n            Export\n          </button>",
    "\n            {t('btn.export')}\n          </button>"
)
print('Export button fixed')

# Fix search placeholder
content = content.replace(
    "placeholder='Search by name, serial number, manufacturer, or site...'",
    "placeholder={t('assets.search')}"
)
content = content.replace(
    "placeholder='Search by name, serial number, manufacturer, or site'",
    "placeholder={t('assets.search')}"
)
print('Search placeholder fixed')

# Fix Active status badge in row - find the status display
old_status_badge = "asset.status?.replace('_', ' ').replace(/\\b\\w/g, (l: string) => l.toUpperCase())"
new_status_badge = "asset.status === 'active' ? t('assets.status.active') : asset.status === 'under_maintenance' ? t('assets.status.under_maintenance') : t('assets.status.retired')"
if old_status_badge in content:
    content = content.replace(old_status_badge, new_status_badge)
    print('Status badge in row fixed')
else:
    # Try alternate
    idx = content.find("'active' ?")
    if idx == -1:
        idx = content.find("status === 'active'")
    print('Status badge context:', repr(content[idx-20:idx+150]) if idx != -1 else 'NOT FOUND')

with open('src/app/dashboard/assets/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Assets page saved')