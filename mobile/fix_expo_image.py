with open('src/screens/WorkOrderDetailScreen.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace React Native Image with expo-image for better caching
content = content.replace(
    "import { View, Text, ScrollView, TouchableOpacity, StyleSheet,\n  TextInput, Alert, ActivityIndicator, Image,\n} from 'react-native'",
    "import { View, Text, ScrollView, TouchableOpacity, StyleSheet,\n  TextInput, Alert, ActivityIndicator,\n} from 'react-native'\nimport { Image } from 'expo-image'"
)

# Add blurhash placeholder for fast loading
content = content.replace(
    "<Image source={{ uri: url }} style={styles.photo} resizeMode='cover' />",
    "<Image source={{ uri: url }} style={styles.photo} contentFit='cover' transition={200} placeholder='LGF5?xYk^6#M@-5c,1J5@[or[Q6.' />"
)

# Fix zoom modal image too
content = content.replace(
    "<Image source={{ uri: zoomPhoto }} style={{ width: Dimensions.get('window').width, height: Dimensions.get('window').width, resizeMode: 'contain' }} />",
    "<Image source={{ uri: zoomPhoto }} style={{ width: Dimensions.get('window').width, height: Dimensions.get('window').width }} contentFit='contain' transition={200} />"
)

with open('src/screens/WorkOrderDetailScreen.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('expo-image applied')