with open('src/components/Sidebar.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(
    "  { label: 'Inventory', href: '/dashboard/inventory', icon: 'V', badge: '', exact: false },",
    """  { label: 'Inventory', href: '/dashboard/inventory', icon: 'V', badge: '', exact: false },
  { label: 'Users', href: '/dashboard/users', icon: 'U', badge: '', exact: false },"""
)

with open('src/components/Sidebar.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Sidebar updated with Users')
print('Has users nav:', '/dashboard/users' in content)