with open('src/app/dashboard/inventory/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Check for any broken replacements that created invalid JS
# The issue is likely 'In Stock' was replaced inside a string context
broken = [
    ("t('inv.status.in')", "t('inv.status.in')"),  # check if doubled
]

# Find all occurrences of inv.status
import re
matches = [(m.start(), m.group()) for m in re.finditer(r"inv\.status\.\w+", content)]
print(f'Found {len(matches)} inv.status references:')
for pos, match in matches:
    print(repr(content[pos-30:pos+50]))
    print('---')

# Also check for any malformed replacements
if "t('inv.status.in')t('inv.status.in')" in content:
    print('DUPLICATE FOUND')
    
# Check the actual error context - look for unterminated strings
lines = content.split('\n')
for i, line in enumerate(lines[55:70], start=56):
    print(f'{i}: {repr(line)}')