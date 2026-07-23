import React, { useState, useEffect } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { useNavigation, useRoute } from '@react-navigation/native'
import { supabase } from '../lib/supabase'
import { isOnline, enqueue } from '../lib/offline'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LangContext'
import { colors } from '../lib/theme'

export default function QRScannerScreen() {
  const [permission, requestPermission] = useCameraPermissions()
  const [scanned, setScanned] = useState(false)
  const navigation = useNavigation<any>()
  const route = useRoute<any>()
  const { profile } = useAuth()
  const { t } = useLang()
  // CORE-10: verify mode — match the scan against a specific WO's asset and
  // record an arrival activity row instead of opening the asset.
  const verifyAssetId: string | null = route.params?.verifyAssetId ?? null
  const verifyWoId: string | null = route.params?.verifyWoId ?? null

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

    // CORE-10: verify mode — the scanned code must resolve to this WO's asset.
    if (verifyAssetId) {
      if (assetId && assetId === verifyAssetId) {
        // Arrival activity row (shows in the WO Activity tab). [ACTIVITY] prefix
        // matches the existing parts-usage convention. A tech scanning an on-site
        // asset is often offline (basement/remote), so queue instead of claiming a
        // false success when the write can't reach the server.
        const body = '[ACTIVITY] Asset confirmed on-site via QR scan'
        const queueIt = () => enqueue({ kind: 'comment', woId: verifyWoId!, body, userId: profile?.id ?? null })
        if (!isOnline()) {
          await queueIt()
          Alert.alert(t('asset_confirmed'), t('offline_queued'), [{ text: t('ok'), onPress: () => navigation.goBack() }])
          return
        }
        const { error: confErr } = await supabase.from('work_order_comments').insert({
          work_order_id: verifyWoId, user_id: profile?.id, body,
        })
        if (confErr) {
          await queueIt()
          Alert.alert(t('asset_confirmed'), t('offline_queued'), [{ text: t('ok'), onPress: () => navigation.goBack() }])
          return
        }
        Alert.alert(t('asset_confirmed'), t('asset_confirmed_msg'), [
          { text: t('ok'), onPress: () => navigation.goBack() },
        ])
        return
      }
      Alert.alert(t('asset_mismatch'), t('asset_mismatch_msg'), [
        { text: t('scan_again'), onPress: () => setScanned(false) },
      ])
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
        // MKT-28: accept the common 1D/2D formats expo-camera supports, not just QR.
        barcodeScannerSettings={{ barcodeTypes: ['qr', 'ean13', 'ean8', 'upc_a', 'upc_e', 'code39', 'code93', 'code128', 'itf14', 'codabar', 'pdf417', 'datamatrix', 'aztec'] }}
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
      />
      <View style={styles.overlay}>
        <View style={styles.scanBox} />
        <Text style={styles.hint}>
          {scanned ? t('opening_asset') : verifyAssetId ? t('confirm_asset_hint') : t('point_at_qr')}
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
