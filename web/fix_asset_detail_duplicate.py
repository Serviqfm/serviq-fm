with open('src/app/dashboard/assets/[id]/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Remove the duplicate - keep the full one with t and lang, remove the one with only lang
content = content.replace(
    "  const { t, lang } = useLanguage()\n  const [asset, setAsset] = useState<any>(null)\n  const [workOrders, setWorkOrders] = useState<any[]>([])\n  const [pmSchedules, setPmSchedules] = useState<any[]>([])\n  const [loading, setLoading] = useState(true)\n  const { lang } = useLanguage()",
    "  const { t, lang } = useLanguage()\n  const [asset, setAsset] = useState<any>(null)\n  const [workOrders, setWorkOrders] = useState<any[]>([])\n  const [pmSchedules, setPmSchedules] = useState<any[]>([])\n  const [loading, setLoading] = useState(true)"
)

print('Duplicate removed:', 'const { lang } = useLanguage()' not in content)
print('Has t and lang:', 'const { t, lang } = useLanguage()' in content)

with open('src/app/dashboard/assets/[id]/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Fixed')