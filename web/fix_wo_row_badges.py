with open('src/app/dashboard/work-orders/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix priority badge in rows
old_pri = "badge(wo.priority.charAt(0).toUpperCase()+wo.priority.slice(1), pCfg)"
new_pri = "badge(wo.priority === 'critical' ? t('wo.priority.critical') : wo.priority === 'high' ? t('wo.priority.high') : wo.priority === 'medium' ? t('wo.priority.medium') : t('wo.priority.low'), pCfg)"

# Fix status badge in rows
old_status = "badge(wo.status.replace('_',' ').replace(/\\b\\w/g,l=>l.toUpperCase()), sCfg)"
new_status = "badge(wo.status === 'new' ? t('wo.status.new') : wo.status === 'assigned' ? t('wo.status.assigned') : wo.status === 'in_progress' ? t('wo.status.in_progress') : wo.status === 'on_hold' ? t('wo.status.on_hold') : wo.status === 'completed' ? t('wo.status.completed') : t('wo.status.closed'), sCfg)"

if old_pri in content:
    content = content.replace(old_pri, new_pri)
    print('Priority badge fixed')
else:
    print('Priority pattern not found')

if old_status in content:
    content = content.replace(old_status, new_status)
    print('Status badge fixed')
else:
    print('Status pattern not found')

with open('src/app/dashboard/work-orders/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Saved')