with open('src/screens/WorkOrderDetailScreen.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# The issue is likely in the timer display or badge rendering
# Fix fontVariant completely
content = content.replace(", fontVariant: ['tabular-nums']", "")
content = content.replace("fontVariant: ['tabular-nums'],", "")
content = content.replace("fontVariant: ['tabular-nums']", "")

# Fix any potential bare text in JSX
content = content.replace(
    "{tab.count ? ' (' + tab.count + ')' : ''}",
    "{tab.count ? ` (${tab.count})` : ''}"
)

with open('src/screens/WorkOrderDetailScreen.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Text error fixed')