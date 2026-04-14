with open('src/screens/WorkOrderDetailScreen.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Reduce image quality and add resize
content = content.replace(
    "mediaTypes: ['images'], quality: 0.7",
    "mediaTypes: ['images'], quality: 0.4, allowsEditing: false"
)
content = content.replace(
    "mediaTypes: ['images'], quality: 0.7 }",
    "mediaTypes: ['images'], quality: 0.4 }"
)

with open('src/screens/WorkOrderDetailScreen.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Image quality reduced for faster loading')