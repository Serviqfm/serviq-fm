with open('src/app/dashboard/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(
    ">Open WOs by Status<",
    ">{lang === 'ar' ? 'أوامر العمل المفتوحة حسب الحالة' : 'Open WOs by Status'}<"
)
content = content.replace(
    ">Open WOs by Priority<",
    ">{lang === 'ar' ? 'أوامر العمل المفتوحة حسب الأولوية' : 'Open WOs by Priority'}<"
)

# Also fix the p tag text directly
content = content.replace(
    "}}>Open WOs by Status</p>",
    ">{lang === 'ar' ? 'أوامر العمل المفتوحة حسب الحالة' : 'Open WOs by Status'}</p>"
)
content = content.replace(
    "}}>Open WOs by Priority</p>",
    ">{lang === 'ar' ? 'أوامر العمل المفتوحة حسب الأولوية' : 'Open WOs by Priority'}</p>"
)

# Check if lang is available
print('Has lang:', 'const { t, lang }' in content or "lang === 'ar'" in content)

# Count fixes
print('Status title occurrences:', content.count('Open WOs by Status'))
print('Priority title occurrences:', content.count('Open WOs by Priority'))

with open('src/app/dashboard/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Chart titles fixed')