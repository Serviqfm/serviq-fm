with open('src/app/dashboard/users/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Find the role cards rendering
import re
print('Requesters count:', content.count('Requesters'))
print('Technicians count:', content.count('Technicians'))

# Check how they're rendered
idx = content.find('Requesters')
print(repr(content[idx-50:idx+100]))