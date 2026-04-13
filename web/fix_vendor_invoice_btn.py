with open('src/app/dashboard/vendors/[id]/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

idx = content.find("activeTab === 'invoices' && (")
print(repr(content[idx:idx+400]))