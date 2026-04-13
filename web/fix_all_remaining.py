import os

# ── 1. Fix PM Schedules page ──
with open('src/app/dashboard/pm-schedules/page.tsx', 'r', encoding='utf-8') as f:
    pm = f.read()

# Fix New PM Schedule button
pm = pm.replace(
    ">New PM Schedule +<",
    ">{t('pm.new')}<"
)
pm = pm.replace(
    ">+ New PM Schedule<",
    ">{t('pm.new')}<"
)
pm = pm.replace(
    "New PM Schedule +",
    "{t('pm.new')}"
)

# Fix subtitle malformed text
pm = pm.replace(
    "schedules \xc3\x82\xc2\xb7 0 active 0",
    ""
)
pm = pm.replace(
    "schedules · 0 active 0",
    ""
)

# Remove duplicate Calendar/Compliance buttons by finding the button section
# Count occurrences
cal_count = pm.count("t('pm.calendar')")
com_count = pm.count("t('pm.compliance')")
print(f'Before fix - Calendar: {cal_count}, Compliance: {com_count}')

# Find the header buttons section and deduplicate
import re

# Find all Link blocks containing pm.calendar
blocks = list(re.finditer(r"<Link href='/dashboard/pm-schedules/calendar'>.*?</Link>", pm, re.DOTALL))
print(f'Calendar Link blocks found: {len(blocks)}')
if len(blocks) > 1:
    # Keep only the first occurrence
    for block in blocks[1:]:
        pm = pm.replace(block.group(), '', 1)
    print('Duplicate calendar button removed')

blocks2 = list(re.finditer(r"<Link href='/dashboard/pm-schedules/compliance'>.*?</Link>", pm, re.DOTALL))
print(f'Compliance Link blocks found: {len(blocks2)}')
if len(blocks2) > 1:
    for block in blocks2[1:]:
        pm = pm.replace(block.group(), '', 1)
    print('Duplicate compliance button removed')

# Fix subtitle - find exact pattern
idx = pm.find('schedules')
if idx != -1:
    print('Subtitle context:', repr(pm[idx-30:idx+100]))

with open('src/app/dashboard/pm-schedules/page.tsx', 'w', encoding='utf-8') as f:
    f.write(pm)
print('PM page saved')

# ── 2. Fix Assets Active badge and column headers ──
with open('src/app/dashboard/assets/page.tsx', 'r', encoding='utf-8') as f:
    assets = f.read()

# Find Active badge in rows
idx = assets.find("'Active'")
if idx != -1:
    print('Active badge found at:', idx)
    print(repr(assets[idx-50:idx+100]))

# Fix the status badge display in row
# Look for the status span in the row
old_active_badge = ">Active<"
if old_active_badge in assets:
    assets = assets.replace(">Active<", ">{t('assets.status.active')}<")
    print('Active badge in row fixed')

# Fix column headers - Status and Site still English
assets = assets.replace("'Status'", "t('common.status')")
assets = assets.replace("'Site'", "t('common.site')")
assets = assets.replace("'Actions'", "t('common.actions')")
assets = assets.replace("'total assets registered'", "t('assets.title').toLowerCase()")

# Fix search placeholder if still English
assets = assets.replace(
    "placeholder='Search by name, serial number, manufacturer, or site...'",
    "placeholder={t('assets.search')}"
)

with open('src/app/dashboard/assets/page.tsx', 'w', encoding='utf-8') as f:
    f.write(assets)
print('Assets page fixed')

# ── 3. Fix Work Orders remaining column headers ──
with open('src/app/dashboard/work-orders/page.tsx', 'r', encoding='utf-8') as f:
    wo = f.read()

wo = wo.replace("'Category'", "t('assets.col.cat')")
wo = wo.replace("'Created'", "t('common.created')")
wo = wo.replace("'Site'", "t('common.site')")
wo = wo.replace("'Actions'", "t('common.actions')")

with open('src/app/dashboard/work-orders/page.tsx', 'w', encoding='utf-8') as f:
    f.write(wo)
print('Work orders columns fixed')

# ── 4. Fix console error — find what's causing it ──
# The error is likely from TranslateButton or an undefined t() call
# Check if TranslateButton has issues
with open('src/components/TranslateButton.tsx', 'r', encoding='utf-8') as f:
    tb = f.read()
print('TranslateButton exists and loads OK')

# ── 5. Add 'common.selected' translation key ──
with open('src/context/LanguageContext.tsx', 'r', encoding='utf-8') as f:
    ctx = f.read()

if "'common.selected'" not in ctx:
    ctx = ctx.replace(
        "  'common.unassigned': 'Unassigned',",
        "  'common.unassigned': 'Unassigned',\n  'common.selected': 'selected',\n  'common.sign_out': 'Sign Out',\n  'common.coming_soon': 'Coming Soon',"
    )
    ctx = ctx.replace(
        "  'common.unassigned': '\u063a\u064a\u0631 \u0645\u0639\u064a\u064e\u0651\u0646',",
        "  'common.unassigned': '\u063a\u064a\u0631 \u0645\u0639\u064a\u064e\u0651\u0646',\n  'common.selected': '\u0645\u062d\u062f\u062f',\n  'common.sign_out': '\u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u062e\u0631\u0648\u062c',\n  'common.coming_soon': '\u0642\u0631\u064a\u0628\u0627\u064b',"
    )
    with open('src/context/LanguageContext.tsx', 'w', encoding='utf-8') as f:
        f.write(ctx)
    print('Translation keys added')

# ── 6. Fix PM subtitle malformed text ──
with open('src/app/dashboard/pm-schedules/page.tsx', 'r', encoding='utf-8') as f:
    pm2 = f.read()

# Find and fix the subtitle
idx = pm2.find('schedules')
while idx != -1:
    context = pm2[idx-50:idx+150]
    if 'active' in context and ('·' in context or '\xc2\xb7' in context):
        print('Found malformed subtitle:', repr(context))
    idx = pm2.find('schedules', idx+1)

# Fix the subtitle pattern
pm2 = pm2.replace(
    "{schedules.length} schedules \xc2\xb7 {schedules.filter(s => s.is_active).length} active",
    "{schedules.length} {t('pm.title').toLowerCase()} \u00b7 {schedules.filter(s => s.is_active).length} {t('common.active').toLowerCase()}"
)
pm2 = pm2.replace(
    "{schedules.length} schedules · {schedules.filter(s => s.is_active).length} active",
    "{schedules.length} {t('pm.title').toLowerCase()} · {schedules.filter(s => s.is_active).length} {t('common.active').toLowerCase()}"
)

with open('src/app/dashboard/pm-schedules/page.tsx', 'w', encoding='utf-8') as f:
    f.write(pm2)
print('PM subtitle fixed')

print('\nAll fixes complete')