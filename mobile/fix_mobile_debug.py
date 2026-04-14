with open('src/context/AuthContext.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(
    ".select('*, organisation:organisation_id(name, plan_tier, vertical)')",
    ".select('*, organisation:organisation_id(name, plan_tier)')"
)

with open('src/context/AuthContext.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Fixed')