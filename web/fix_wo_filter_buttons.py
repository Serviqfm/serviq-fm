with open('src/app/dashboard/work-orders/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix status button label generation
old_status_label = "            {s === 'all' ? 'All' : s.replace('_',' ').replace(/\\b\\w/g, l => l.toUpperCase())}"
new_status_label = """            {s === 'all' ? t('common.all') : s === 'new' ? t('wo.status.new') : s === 'assigned' ? t('wo.status.assigned') : s === 'in_progress' ? t('wo.status.in_progress') : s === 'on_hold' ? t('wo.status.on_hold') : s === 'completed' ? t('wo.status.completed') : s === 'closed' ? t('wo.status.closed') : s}"""

if old_status_label in content:
    content = content.replace(old_status_label, new_status_label)
    print('Status buttons fixed')
else:
    print('Pattern not found - trying alternate')
    idx = content.find("s.replace('_',' ')")
    print(repr(content[idx-50:idx+150]))

# Now find priority buttons
idx = content.find("'all','critical'")
if idx == -1:
    idx = content.find("'critical'")
print('Priority context:')
print(repr(content[idx-100:idx+300]))

with open('src/app/dashboard/work-orders/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Saved')