with open('src/app/dashboard/users/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix column headers
content = content.replace("'Actions'", "t('common.actions')")
content = content.replace("'Status'", "t('common.status')")

# Fix role badge in rows
old_badge = "u.role?.charAt(0).toUpperCase() + u.role?.slice(1)"
new_badge = "u.role === 'admin' ? (lang === 'ar' ? 'مشرف' : 'Admin') : u.role === 'manager' ? (lang === 'ar' ? 'مدير' : 'Manager') : u.role === 'technician' ? (lang === 'ar' ? 'فني' : 'Technician') : (lang === 'ar' ? 'مقدم طلب' : 'Requester')"

if old_badge in content:
    content = content.replace(old_badge, new_badge)
    print('Role badge fixed')
else:
    print('Pattern not found')

with open('src/app/dashboard/users/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Saved')