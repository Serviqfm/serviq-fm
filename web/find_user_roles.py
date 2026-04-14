with open('src/app/dashboard/users/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix role card label
old = "{role.charAt(0).toUpperCase() + role.slice(1)}"
new = "{role === 'admin' ? (lang === 'ar' ? 'المشرف' : 'Admin') : role === 'manager' ? (lang === 'ar' ? 'المدير' : 'Manager') : role === 'technician' ? (lang === 'ar' ? 'الفني' : 'Technician') : (lang === 'ar' ? 'مقدم الطلب' : 'Requester')}"

if old in content:
    content = content.replace(old, new)
    print('Role card labels fixed')
else:
    idx = content.find('role.charAt')
    print('Pattern not found, context:', repr(content[idx-20:idx+80]))

# Fix Actions and Status column headers
content = content.replace(">Actions<", ">{t('common.actions')}<")
content = content.replace(">Status<", ">{t('common.status')}<")

# Fix role badge in table rows
old_badge = "{u.role.charAt(0).toUpperCase() + u.role.slice(1)}"
new_badge = "{u.role === 'admin' ? (lang === 'ar' ? 'مشرف' : 'Admin') : u.role === 'manager' ? (lang === 'ar' ? 'مدير' : 'Manager') : u.role === 'technician' ? (lang === 'ar' ? 'فني' : 'Technician') : (lang === 'ar' ? 'مقدم طلب' : 'Requester')}"
if old_badge in content:
    content = content.replace(old_badge, new_badge)
    print('Role badge in rows fixed')

with open('src/app/dashboard/users/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Saved')