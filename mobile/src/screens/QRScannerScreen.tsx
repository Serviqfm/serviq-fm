import React, { useState, useEffect } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { useNavigation } from '@react-navigation/native'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LangContext'
import { colors } from '../lib/theme'

export default function QRScannerScreen() {
  const [permission, requestPermission] = useCameraPermissions()
  const [scanned, setScanned] = useState(false)
  const navigation = useNavigation<any>()
  const { profile } = useAuth()
  const { t } = useLang()

  useEffect(() => {
    if (!permission?.granted) requestPermission()
  }, [])

  async function handleBarCodeScanned({ data }: { data: string }) {
    if (scanned) return
    setScanned(true)

    if (!profile?.organisation_id) {
      Alert.alert(t('error'), t('org_not_loaded'))
      setScanned(false)
      return
    }

    // Resolve a candidate asset id from the QR payload (URL or bare UUID),
    // then ALWAYS verify the asset belongs to the user's organisation.
    const urlMatch = data.match(/assets\/([0-9a-f-]{36})/i)
    const candidateId = urlMatch
      ? urlMatch[1]
      : (/^[0-9a-f-]{36}$/i.test(data) ? data : null)

    let assetId: string | null = null
    try {
      let query = supabase
        .from('assets')
        .select('id')
        .eq('organisation_id', profile.organisation_id)
      query = candidateId ? query.eq('id', candidateId) : query.eq('qr_code', data)
      const { data: asset, error } = await query.maybeSingle()
      if (error) throw error
      assetId = asset?.id ?? null
    } catch {
      Alert.alert(t('error'), t('qr_lookup_failed'))
      setScanned(false)
      return
    }

    if (assetId) {
      navigation.replace('AssetDetail', { id: assetId })
      return
    }

    // Asset Log fallback: the item QR encodes an `al/{uuid}` landing URL (or a
    // bare uuid). Resolve asset_log_items.qr_token, still org-scoped.
    const alMatch = data.match(/al\/([0-9a-f-]{36})/i)
    const alToken = alMatch?.[1] ?? (candidateId /* bare uuid tried above as asset id */ ?? null)
    if (alToken) {
      try {
        const { data: item } = await supabase
          .from('asset_log_items')
          .select('id')
          .eq('organisation_id', profile.organisation_id)
          .eq('qr_token', alToken)
          .maybeSingle()
        if (item?.id) {
          navigation.replace('AssetLogDetail', { id: item.id })
          return
        }
      } catch {
        Alert.alert(t('error'), t('qr_lookup_failed'))
        setScanned(false)
        return
      }
    }

    Alert.alert(
      t('not_found_title'),
      t('asset_not_in_org'),
      [{ text: t('scan_again'), onPress: () => setScanned(false) }]
    )
  }

  if (!permission) {
    return (
      <View style={styles.center}>
        <Text style={styles.text}>{t('requesting_camera')}</Text>
      </View>
    )
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.text}>{t('camera_access_required')}</Text>
        <TouchableOpacity style={styles.btn} onPress={requestPermission}>
          <Text style={styles.btnText}>{t('grant_access')}</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View style={{ flex: 1 }}>
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
      />
      <View style={styles.overlay}>
        <View style={styles.scanBox} />
        <Text style={styles.hint}>
          {scanned ? t('opening_asset') : t('point_at_qr')}
        </Text>
        {scanned && (
          <TouchableOpacity style={styles.btn} onPress={() => setScanned(false)}>
            <Text style={styles.btnText}>{t('scan_again')}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[styles.btn, { marginTop: 12, backgroundColor: 'rgba(255,255,255,0.2)' }]} onPress={() => navigation.goBack()}>
          <Text style={[styles.btnText, { color: 'white' }]}>{t('cancel')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  text: { fontSize: 15, color: '#444', textAlign: 'center', marginBottom: 16 },
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  scanBox: {
    width: 240, height: 240,
    borderWidth: 2, borderColor: colors.teal,
    borderRadius: 16, backgroundColor: 'transparent',
    marginBottom: 32,
  },
  hint: { color: 'white', fontSize: 15, fontWeight: '600', marginBottom: 24, textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  btn: { backgroundColor: colors.primary, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 10 },
  btnText: { color: 'white', fontWeight: '600', fontSize: 15 },
})
