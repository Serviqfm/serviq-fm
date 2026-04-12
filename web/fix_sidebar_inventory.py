with open('src/components/Sidebar.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(
    "  { label: 'Inventory', icon: 'V' },",
    ""
)

content = content.replace(
    "  { label: 'Inspections', href: '/dashboard/inspections', icon: 'I', badge: '', exact: false },",
    """  { label: 'Inspections', href: '/dashboard/inspections', icon: 'I', badge: '', exact: false },
  { label: 'Inventory', href: '/dashboard/inventory', icon: 'V', badge: '', exact: false },"""
)

with open('src/components/Sidebar.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Sidebar updated')
print('Has inventory nav:', '/dashboard/inventory' in content)