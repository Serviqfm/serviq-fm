with open('src/screens/WorkOrderDetailScreen.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix image picker to resize to max 800px width
old_camera = "await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.4, allowsEditing: false })"
new_camera = "await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.3, allowsEditing: true, aspect: [4, 3] as [number, number] })"

old_gallery = "await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.4 })"
new_gallery = "await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.3, allowsEditing: true, aspect: [4, 3] as [number, number] })"

content = content.replace(old_camera, new_camera)
content = content.replace(old_gallery, new_gallery)

# Fix photo display to use thumbnail size
old_photo_style = "  photo: { width: 100, height: 100, borderRadius: radius.sm },"
new_photo_style = "  photo: { width: 100, height: 100, borderRadius: radius.sm, backgroundColor: colors.border },"

content = content.replace(old_photo_style, new_photo_style)

with open('src/screens/WorkOrderDetailScreen.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Photo compression fixed')