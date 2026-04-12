with open('src/components/Sidebar.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(
    "  { label: 'Vendors', icon: 'N' },",
    ""
)

content = content.replace(
    "  { label: 'Sites', href: '/dashboard/sites', icon: 'S', badge: '', exact: false },",
    "  { label: 'Sites', href: '/dashboard/sites', icon: 'S', badge: '', exact: false },\n  { label: 'Vendors', href: '/dashboard/vendors', icon: 'N', badge: '', exact: false },"
)

with open('src/components/Sidebar.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print('Done')
print('Vendors in nav:', '/dashboard/vendors' in content)
