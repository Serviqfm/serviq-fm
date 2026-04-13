with open('src/app/dashboard/vendors/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

lines = content.split('\n')
for i, line in enumerate(lines, start=1):
    if 'Active' in line or 'Inactive' in line or 'active' in line.lower():
        print(f'{i}: {line}')