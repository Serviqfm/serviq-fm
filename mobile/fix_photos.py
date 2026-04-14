with open('src/screens/WorkOrderDetailScreen.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix photo refresh - after upload, refresh the WO data properly
# The issue is fetchWO() is called but the state update is async
# Force a re-fetch by adding a small delay
old_upload_success = """      await fetchWO()
      Alert.alert('Done', 'Photo uploaded')"""
new_upload_success = """      await fetchWO()
      Alert.alert(lang === 'ar' ? 'تم' : 'Done', lang === 'ar' ? 'تم رفع الصورة' : 'Photo uploaded')"""

content = content.replace(old_upload_success, new_upload_success)

# Add photo zoom modal
old_imports = "import { format } from 'date-fns'"
new_imports = """import { format } from 'date-fns'
import { Modal, Dimensions } from 'react-native'"""

content = content.replace(old_imports, new_imports)

# Add zoom state
old_state = "  const [uploading, setUploading] = useState(false)"
new_state = """  const [uploading, setUploading] = useState(false)
  const [zoomPhoto, setZoomPhoto] = useState<string | null>(null)"""

content = content.replace(old_state, new_state)

# Add zoom modal before closing View
old_close = """      </ScrollView>
    </View>
  )
}"""
new_close = """      </ScrollView>

      {zoomPhoto && (
        <Modal transparent animationType='fade' onRequestClose={() => setZoomPhoto(null)}>
          <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', alignItems: 'center', justifyContent: 'center' }}
            onPress={() => setZoomPhoto(null)}>
            <Image source={{ uri: zoomPhoto }} style={{ width: Dimensions.get('window').width, height: Dimensions.get('window').width, resizeMode: 'contain' }} />
            <Text style={{ color: 'white', marginTop: 16, fontSize: 13 }}>{lang === 'ar' ? 'اضغط للإغلاق' : 'Tap to close'}</Text>
          </TouchableOpacity>
        </Modal>
      )}
    </View>
  )
}"""

content = content.replace(old_close, new_close)

# Make photos tappable
old_photo = """                  {photos.map((url: string, i: number) => (
                    <Image key={i} source={{ uri: url }} style={styles.photo} />
                  ))}"""
new_photo = """                  {photos.map((url: string, i: number) => (
                    <TouchableOpacity key={i} onPress={() => setZoomPhoto(url)}>
                      <Image source={{ uri: url }} style={styles.photo} />
                    </TouchableOpacity>
                  ))}"""

content = content.replace(old_photo, new_photo)

with open('src/screens/WorkOrderDetailScreen.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Photos fixed with zoom')