with open('src/app/dashboard/assets/[id]/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace Arabic text in JSX with unicode escape sequences or move to variables
# The problem is Arabic in inline ternary inside JSX attributes

# Replace the problematic lines with safe versions
old_back = "{lang === 'ar' ? '\u0631\u062c\u0648\u0639 \u0644\u0644\u0623\u0635\u0648\u0644' : 'Back to Assets'}"
new_back = "{lang === 'ar' ? t('common.back') : 'Back to Assets'}"

old_edit = "{lang === 'ar' ? '\u062a\u0639\u062f\u064a\u0644 \u0627\u0644\u0623\u0635\u0644' : 'Edit Asset'}"
new_edit = "{lang === 'ar' ? t('common.edit') + ' ' + t('common.asset') : 'Edit Asset'}"

# Simpler approach - just use t() for everything
old_back2 = ">{lang === 'ar' ? '\u0631\u062c\u0648\u0639 \u0644\u0644\u0623\u0635\u0648\u0644' : 'Back to Assets'}<"
new_back2 = ">{lang === 'ar' ? t('common.back') : 'Back to Assets'}<"

old_edit2 = ">{lang === 'ar' ? '\u062a\u0639\u062f\u064a\u0644 \u0627\u0644\u0623\u0635\u0644' : 'Edit Asset'}<"
new_edit2 = ">{lang === 'ar' ? t('common.edit') : 'Edit Asset'}<"

print('Has Arabic back:', '\u0631\u062c\u0648\u0639' in content)
print('Has Arabic edit:', '\u062a\u0639\u062f\u064a\u0644' in content)

content = content.replace(old_back2, new_back2)
content = content.replace(old_edit2, new_edit2)

# Also check for statusConfig Arabic
old_active = "lang === 'ar' ? '\u0646\u0634\u0637' : 'Active'"
new_active = "lang === 'ar' ? t('common.active') : 'Active'"
old_under = "lang === 'ar' ? '\u062a\u062d\u062a \u0627\u0644\u0635\u064a\u0627\u0646\u0629' : 'Under Maintenance'"
new_under = "lang === 'ar' ? t('assets.status.under_maintenance') : 'Under Maintenance'"
old_retired = "lang === 'ar' ? '\u0645\u062a\u0642\u0627\u0639\u062f' : 'Retired'"
new_retired = "lang === 'ar' ? t('assets.status.retired') : 'Retired'"

content = content.replace(old_active, new_active)
content = content.replace(old_under, new_under)
content = content.replace(old_retired, new_retired)

print('Has Arabic after fix:', any(ord(c) > 1000 for c in content))

with open('src/app/dashboard/assets/[id]/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Done')