with open('src/app/dashboard/assets/export/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix the broken newline in join
import re
content = re.sub(r"\.join\('[\r\n]+'\)", ".join('\\\\n')", content)

with open('src/app/dashboard/assets/export/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Export page fixed')