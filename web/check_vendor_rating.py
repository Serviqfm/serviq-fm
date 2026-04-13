with open('src/app/dashboard/vendors/[id]/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

idx = content.find('star')
if idx == -1:
    idx = content.find('Rating')
print(repr(content[idx:idx+400]))
print('Has save rating function:', 'saveRating' in content)
print('Has star buttons:', '★' in content or 'star' in content.lower())