with open('src/components/Sidebar.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(
    "  { label: 'Inspections', icon: 'I' },",
    ""
)

content = content.replace(
    "  { label: 'Vendors', href: '/dashboard/vendors', icon: 'N', badge: '', exact: false },",
    """  { label: 'Vendors', href: '/dashboard/vendors', icon: 'N', badge: '', exact: false },
  { label: 'Inspections', href: '/dashboard/inspections', icon: 'I', badge: '', exact: false },"""
)

with open('src/components/Sidebar.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Sidebar updated with Inspections')
print('Has inspections nav:', '/dashboard/inspections' in content)