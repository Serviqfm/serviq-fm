with open('src/app/dashboard/work-orders/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

old_priority = "            {p === 'all' ? t('filter.all_priorities') : p.charAt(0).toUpperCase() + p.slice(1)}"
new_priority = """            {p === 'all' ? t('filter.all_priorities') : p === 'critical' ? t('wo.priority.critical') : p === 'high' ? t('wo.priority.high') : p === 'medium' ? t('wo.priority.medium') : t('wo.priority.low')}"""

if old_priority in content:
    content = content.replace(old_priority, new_priority)
    print('Priority buttons fixed')
else:
    print('Pattern not found')
    idx = content.find("p.charAt(0)")
    print(repr(content[idx-80:idx+100]))

# Also fix status badge in table rows
old_badge = "s.status?.replace('_', ' ').replace(/\\b\\w/g, (l: string) => l.toUpperCase())"
new_badge = "s.status === 'new' ? t('wo.status.new') : s.status === 'assigned' ? t('wo.status.assigned') : s.status === 'in_progress' ? t('wo.status.in_progress') : s.status === 'on_hold' ? t('wo.status.on_hold') : s.status === 'completed' ? t('wo.status.completed') : s.status === 'closed' ? t('wo.status.closed') : s.status"

if old_badge in content:
    content = content.replace(old_badge, new_badge)
    print('Status badge in rows fixed')

# Fix priority badge in rows
old_pri_badge = "s.priority?.charAt(0).toUpperCase() + s.priority?.slice(1)"
new_pri_badge = "s.priority === 'critical' ? t('wo.priority.critical') : s.priority === 'high' ? t('wo.priority.high') : s.priority === 'medium' ? t('wo.priority.medium') : t('wo.priority.low')"

if old_pri_badge in content:
    content = content.replace(old_pri_badge, new_pri_badge)
    print('Priority badge in rows fixed')

# Fix Unassigned text
content = content.replace(
    "wo.assignee?.full_name ?? 'Unassigned'",
    "wo.assignee?.full_name ?? t('common.unassigned')"
)
content = content.replace(
    "wo.vendor?.company_name ?? 'Unassigned'",
    "wo.vendor?.company_name ?? t('common.unassigned')"
)

with open('src/app/dashboard/work-orders/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('All WO fixes saved')