with open('src/app/dashboard/assets/[id]/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# The problem is t() called in const before return
# Replace with a function that uses lang directly
old_config = """  const statusConfig: Record<string, { bg: string; color: string; label: string }> = {
    active:            { bg: '#e8f5e9', color: '#2e7d32', label: t('assets.status.active') },
    under_maintenance: { bg: '#fff8e1', color: '#f57f17', label: t('assets.status.under_maintenance') },
    retired:           { bg: '#f5f5f5', color: '#424242', label: t('assets.status.retired') },
  }"""

new_config = """  const statusConfig: Record<string, { bg: string; color: string; label: string }> = {
    active:            { bg: '#e8f5e9', color: '#2e7d32', label: lang === 'ar' ? 'نشط' : 'Active' },
    under_maintenance: { bg: '#fff8e1', color: '#f57f17', label: lang === 'ar' ? 'تحت الصيانة' : 'Under Maintenance' },
    retired:           { bg: '#f5f5f5', color: '#424242', label: lang === 'ar' ? 'متقاعد' : 'Retired' },
  }"""

if old_config in content:
    content = content.replace(old_config, new_config)
    print('Status config fixed')
else:
    print('Pattern not found - checking current state:')
    idx = content.find('statusConfig')
    print(repr(content[idx:idx+300]))

with open('src/app/dashboard/assets/[id]/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Saved')