with open('src/screens/WorkOrderDetailScreen.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Add import
content = content.replace(
    "import * as ImagePicker from 'expo-image-picker'",
    "import * as ImagePicker from 'expo-image-picker'\nimport * as ImageManipulator from 'expo-image-manipulator'"
)

# Replace the upload function to compress first
old_upload = """    try {
      const uri = result.assets[0].uri
      const filename = 'wo-' + wo.id + '-' + Date.now() + '.jpg'
      const response = await fetch(uri)
      const blob = await response.blob()
      const arrayBuffer = await new Response(blob).arrayBuffer()
      const { error } = await supabase.storage.from('media').upload(filename, arrayBuffer, { contentType: 'image/jpeg', upsert: true })"""

new_upload = """    try {
      const originalUri = result.assets[0].uri
      // Compress and resize to max 800px
      const compressed = await ImageManipulator.manipulateAsync(
        originalUri,
        [{ resize: { width: 800 } }],
        { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG }
      )
      const uri = compressed.uri
      const filename = 'wo-' + wo.id + '-' + Date.now() + '.jpg'
      const response = await fetch(uri)
      const blob = await response.blob()
      const arrayBuffer = await new Response(blob).arrayBuffer()
      const { error } = await supabase.storage.from('media').upload(filename, arrayBuffer, { contentType: 'image/jpeg', upsert: true })"""

content = content.replace(old_upload, new_upload)

with open('src/screens/WorkOrderDetailScreen.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Photo compression with resize applied')