with open('src/app/dashboard/assets/[id]/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Add t and lang to the component
content = content.replace(
    "  const supabase = createClient()",
    "  const supabase = createClient()\n  const { t, lang } = useLanguage()"
)

# Fix status config labels to use t()
content = content.replace(
    "    active:            { bg: '#e8f5e9', color: '#2e7d32', label: 'Active' },",
    "    active:            { bg: '#e8f5e9', color: '#2e7d32', label: t('assets.status.active') },"
)
content = content.replace(
    "    under_maintenance: { bg: '#fff8e1', color: '#f57f17', label: 'Under Maintenance' },",
    "    under_maintenance: { bg: '#fff8e1', color: '#f57f17', label: t('assets.status.under_maintenance') },"
)
content = content.replace(
    "    retired:           { bg: '#f5f5f5', color: '#424242', label: 'Retired' },",
    "    retired:           { bg: '#f5f5f5', color: '#424242', label: t('assets.status.retired') },"
)

# Fix Edit Asset button
content = content.replace(
    ">Edit Asset<",
    ">{lang === 'ar' ? 'تعديل الأصل' : 'Edit Asset'}<"
)

# Fix Back to Assets
content = content.replace(
    ">Back to Assets<",
    ">{lang === 'ar' ? 'رجوع للأصول' : 'Back to Assets'}<"
)

with open('src/app/dashboard/assets/[id]/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Asset detail page fixed')
print('Has t():', "const { t, lang }" in content)