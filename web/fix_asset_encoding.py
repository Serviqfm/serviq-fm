with open('src/app/dashboard/assets/[id]/page.tsx', 'rb') as f:
    raw = f.read()

# Convert CRLF to LF
content = raw.replace(b'\r\n', b'\n').decode('utf-8')

# Remove ALL Arabic characters - replace with t() calls or English
import re

# Replace any remaining Arabic text with safe alternatives
arabic_replacements = [
    ("\u0631\u062c\u0648\u0639 \u0644\u0644\u0623\u0635\u0648\u0644", "Back to Assets"),
    ("\u062a\u0639\u062f\u064a\u0644 \u0627\u0644\u0623\u0635\u0644", "Edit Asset"),
    ("\u0646\u0634\u0637", "Active"),
    ("\u062a\u062d\u062a \u0627\u0644\u0635\u064a\u0627\u0646\u0629", "Under Maintenance"),
    ("\u0645\u062a\u0642\u0627\u0639\u062f", "Retired"),
]

for arabic, english in arabic_replacements:
    if arabic in content:
        print(f'Replacing Arabic: {repr(arabic)} -> {english}')
        content = content.replace(arabic, english)

# Fix the ternary expressions that used Arabic
content = content.replace(
    ">{lang === 'ar' ? 'Back to Assets' : 'Back to Assets'}<",
    ">{t('common.back')}<"
)
content = content.replace(
    ">{lang === 'ar' ? 'Edit Asset' : 'Edit Asset'}<",
    ">{t('common.edit')}<"
)
content = content.replace(
    ">{lang === 'ar' ? t('common.back') : 'Back to Assets'}<",
    ">{t('common.back')}<"
)
content = content.replace(
    ">{lang === 'ar' ? t('common.edit') : 'Edit Asset'}<",
    ">{t('common.edit')}<"
)

# Fix status config
content = content.replace(
    "lang === 'ar' ? t('common.active') : 'Active'",
    "t('assets.status.active')"
)
content = content.replace(
    "lang === 'ar' ? t('assets.status.under_maintenance') : 'Under Maintenance'",
    "t('assets.status.under_maintenance')"
)
content = content.replace(
    "lang === 'ar' ? t('assets.status.retired') : 'Retired'",
    "t('assets.status.retired')"
)

# Check for any remaining Arabic
has_arabic = any(ord(c) > 1000 for c in content)
print('Has Arabic after fix:', has_arabic)

# Write as LF only
with open('src/app/dashboard/assets/[id]/page.tsx', 'w', encoding='utf-8', newline='\n') as f:
    f.write(content)
print('File saved with LF line endings')
print('File size:', len(content))