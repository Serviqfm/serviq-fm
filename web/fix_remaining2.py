# ── Fix Assets status config labels ──
with open('src/app/dashboard/assets/page.tsx', 'r', encoding='utf-8') as f:
    assets = f.read()

# Fix label in statusConfig object
assets = assets.replace(
    "{ bg: '#e8f5e9', color: '#2e7d32', label: 'Active' }",
    "{ bg: '#e8f5e9', color: '#2e7d32', label: t('assets.status.active') }"
)
assets = assets.replace(
    "{ bg: '#fff8e1', color: '#f57f17', label: 'Under Maintenance' }",
    "{ bg: '#fff8e1', color: '#f57f17', label: t('assets.status.under_maintenance') }"
)
assets = assets.replace(
    "{ bg: '#f5f5f5', color: '#666', label: 'Retired' }",
    "{ bg: '#f5f5f5', color: '#666', label: t('assets.status.retired') }"
)

with open('src/app/dashboard/assets/page.tsx', 'w', encoding='utf-8') as f:
    f.write(assets)
print('Assets status config labels fixed')

# ── Fix PM subtitle malformed Â· characters ──
with open('src/app/dashboard/pm-schedules/page.tsx', 'r', encoding='utf-8') as f:
    pm = f.read()

# Fix the malformed subtitle with Â· encoding issue
pm = pm.replace(
    "{stats.total} schedules \xc3\x82\xc2\xb7 {stats.active} active",
    "{stats.total} {t('pm.title').toLowerCase()} \u00b7 {stats.active} {t('common.active').toLowerCase()}"
)
pm = pm.replace(
    "schedules \xc3\x82\xc2\xb7",
    "schedules \u00b7"
)
pm = pm.replace(
    "active\n",
    "active\n"
)

# Find and print the subtitle for manual inspection
idx = pm.find('stats.total')
if idx != -1:
    print('Subtitle area:', repr(pm[idx-20:idx+200]))

# Replace all variations of the broken subtitle
import re
# Fix any remaining Â· patterns
pm = re.sub(r'schedules\s+\xc3\x82\xc2\xb7\s+\{stats\.active\}\s+active', 
            "{stats.total} {t('pm.title').toLowerCase()} \u00b7 {stats.active} {t('common.active').toLowerCase()}",
            pm)

# Also fix overdue span
pm = pm.replace(
    "\xc3\x82\xc2\xb7 {stats.due} overdue",
    "\u00b7 {stats.due} {t('wo.overdue')}"
)
pm = pm.replace(
    "Â· {stats.due} overdue",
    "· {stats.due} {t('wo.overdue')}"
)

with open('src/app/dashboard/pm-schedules/page.tsx', 'w', encoding='utf-8') as f:
    f.write(pm)
print('PM subtitle encoding fixed')

# ── Find the console error ── 
# Check work orders page for any undefined references
with open('src/app/dashboard/work-orders/page.tsx', 'r', encoding='utf-8') as f:
    wo = f.read()

# Check for common issues
issues = []
if "t('assets.col.cat')" in wo and 'useLanguage' not in wo:
    issues.append('useLanguage not imported in WO page')
if "'Category'" in wo:
    issues.append('Category still hardcoded in WO page')

print('WO page issues:', issues if issues else 'None found')
print('Has useLanguage:', 'useLanguage' in wo)
print('Has t =', "const { t }" in wo)

# ── Fix console error — likely from LanguageContext SSR issue ──
with open('src/context/LanguageContext.tsx', 'r', encoding='utf-8') as f:
    ctx = f.read()

# The error is from useState initializer running on server
# Add typeof window check
old_init = """  const [lang, setLangState] = useState<Language>(() => {
    if (typeof window === 'undefined') return 'en'
    const cookie = document.cookie.split(';').map(c => c.trim()).find(c => c.startsWith('serviq_lang='))?.split('=')[1]
    const stored = cookie || localStorage.getItem('serviq_lang')
    return (stored === 'ar' || stored === 'en') ? stored as Language : 'en'
  })"""

if old_init in ctx:
    print('Language init already has SSR check')
else:
    print('Language init missing SSR check - fixing')
    ctx = ctx.replace(
        "  const [lang, setLangState] = useState<Language>('en')",
        """  const [lang, setLangState] = useState<Language>(() => {
    if (typeof window === 'undefined') return 'en'
    try {
      const cookie = document.cookie.split(';').map(c => c.trim()).find(c => c.startsWith('serviq_lang='))?.split('=')[1]
      const stored = cookie || localStorage.getItem('serviq_lang')
      return (stored === 'ar' || stored === 'en') ? stored as Language : 'en'
    } catch { return 'en' }
  })"""
    )
    with open('src/context/LanguageContext.tsx', 'w', encoding='utf-8') as f:
        f.write(ctx)
    print('Language init fixed')

print('All done')