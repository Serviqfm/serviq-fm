with open('src/app/dashboard/work-orders/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Find status filter buttons
idx = content.find('statusOptions')
if idx == -1:
    idx = content.find("value='new'")
if idx == -1:
    idx = content.find('setStatusFilter')
    # Find the next occurrence which is the buttons
    idx2 = content.find('setStatusFilter', idx + 20)
    print('Button rendering context:')
    print(repr(content[idx2-50:idx2+300]))
else:
    print(repr(content[idx:idx+500]))