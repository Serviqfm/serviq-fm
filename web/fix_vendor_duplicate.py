with open('src/app/dashboard/vendors/[id]/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Remove the duplicate workOrders state that was added by our script
content = content.replace(
    "  const [savingInvoice, setSavingInvoice] = useState(false)\n  const [workOrders, setWorkOrders] = useState<any[]>([])\n  const [rating,",
    "  const [savingInvoice, setSavingInvoice] = useState(false)\n  const [rating,"
)

with open('src/app/dashboard/vendors/[id]/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Duplicate removed')
print('workOrders count:', content.count('const [workOrders'))