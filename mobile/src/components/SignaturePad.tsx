import React, { useRef } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native'
import SignatureScreen from 'react-native-signature-canvas'
import { Ionicons } from '@expo/vector-icons'
import { colors, radius } from '../lib/theme'

// WO-19: drawn close-out signature. Wraps the WebView-based canvas in its own
// modal so its draw gestures don't fight the close sheet's ScrollView. onOK
// fires with a `data:image/png;base64,...` URL; the caller uploads it.
type Props = {
  visible: boolean
  onClose: () => void
  onSave: (dataUrl: string) => void
  arabic?: boolean
}

// Hide the library's default footer — Clear/Save are driven from RN below.
const WEB_STYLE = `.m-signature-pad--footer { display: none; margin: 0; }
  .m-signature-pad { box-shadow: none; border: none; }
  .m-signature-pad--body { border: none; }
  body, html { width: 100%; height: 100%; margin: 0; }`

export default function SignaturePad({ visible, onClose, onSave, arabic }: Props) {
  const ref = useRef<any>(null)

  function handleOK(sig: string) {
    onSave(sig)
    onClose()
  }

  return (
    <Modal visible={visible} transparent animationType='slide' onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{arabic ? 'التوقيع' : 'Signature'}</Text>
          <View style={styles.canvasBox}>
            <SignatureScreen
              ref={ref}
              onOK={handleOK}
              webStyle={WEB_STYLE}
              backgroundColor='rgba(255,255,255,1)'
              penColor={colors.text}
              autoClear={false}
              descriptionText=''
            />
          </View>
          <View style={styles.actions}>
            <TouchableOpacity style={[styles.btn, styles.ghost]} onPress={() => ref.current?.clearSignature()}>
              <Ionicons name='refresh-outline' size={16} color={colors.textSecondary} />
              <Text style={styles.ghostText}>{arabic ? 'مسح' : 'Clear'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, styles.ghost]} onPress={onClose}>
              <Text style={styles.ghostText}>{arabic ? 'إلغاء' : 'Cancel'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, styles.primary]} onPress={() => ref.current?.readSignature()}>
              <Text style={styles.primaryText}>{arabic ? 'حفظ' : 'Save'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { backgroundColor: 'white', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32 },
  title: { fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: 12 },
  canvasBox: { height: 240, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: 'white' },
  actions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  btn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 14, borderRadius: radius.sm },
  ghost: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  ghostText: { color: colors.textSecondary, fontSize: 15, fontWeight: '600' },
  primary: { backgroundColor: colors.primary },
  primaryText: { color: 'white', fontSize: 15, fontWeight: '600' },
})
