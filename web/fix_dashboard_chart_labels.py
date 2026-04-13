with open('src/app/dashboard/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix statusConfig labels
old_status_config = """  const statusConfig: Record<string, { label: string; color: string }> = {
    new:         { label: 'New',         color: '#0d47a1' },
    assigned:    { label: 'Assigned',    color: '#283593' },
    in_progress: { label: 'In Progress', color: '#f57f17' },
    on_hold:     { label: 'On Hold',     color: '#880e4f' },
  }"""

new_status_config = """  const statusConfig: Record<string, { label: string; color: string }> = {
    new:         { label: t('wo.status.new'),         color: '#0d47a1' },
    assigned:    { label: t('wo.status.assigned'),    color: '#283593' },
    in_progress: { label: t('wo.status.in_progress'), color: '#f57f17' },
    on_hold:     { label: t('wo.status.on_hold'),     color: '#880e4f' },
  }"""

if old_status_config in content:
    content = content.replace(old_status_config, new_status_config)
    print('Status config fixed')
else:
    print('Status config already fixed')

# Fix priorityConfig labels
old_priority_config = """  const priorityConfig: Record<string, { label: string; color: string }> = {
    critical: { label: 'Critical', color: '#b71c1c' },
    high:     { label: 'High',     color: '#e65100' },
    medium:   { label: 'Medium',   color: '#f57f17' },
    low:      { label: 'Low',      color: '#2e7d32' },
  }"""

new_priority_config = """  const priorityConfig: Record<string, { label: string; color: string }> = {
    critical: { label: t('wo.priority.critical'), color: '#b71c1c' },
    high:     { label: t('wo.priority.high'),     color: '#e65100' },
    medium:   { label: t('wo.priority.medium'),   color: '#f57f17' },
    low:      { label: t('wo.priority.low'),      color: '#2e7d32' },
  }"""

if old_priority_config in content:
    content = content.replace(old_priority_config, new_priority_config)
    print('Priority config fixed')
else:
    print('Priority config pattern not found')

with open('src/app/dashboard/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Dashboard chart labels saved')