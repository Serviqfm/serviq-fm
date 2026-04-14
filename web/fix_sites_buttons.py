with open('src/app/dashboard/sites/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(
    ">Add Site +<",
    ">{lang === 'ar' ? '+ إضافة موقع' : 'Add Site +'}<"
)
content = content.replace(
    ">Add Site<",
    ">{lang === 'ar' ? '+ إضافة موقع' : 'Add Site +'}<"
)
content = content.replace(
    ">Deactivate<",
    ">{lang === 'ar' ? 'إيقاف' : 'Deactivate'}<"
)
content = content.replace(
    ">Activate<",
    ">{lang === 'ar' ? 'تفعيل' : 'Activate'}<"
)
content = content.replace(
    "'sites registered'",
    "lang === 'ar' ? 'مواقع مسجلة' : 'sites registered'"
)
content = content.replace(
    "City:",
    "{lang === 'ar' ? 'المدينة:' : 'City:'}"
)
content = content.replace(
    "'Added '",
    "lang === 'ar' ? 'أُضيف ' : 'Added '"
)

with open('src/app/dashboard/sites/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Sites buttons fixed')