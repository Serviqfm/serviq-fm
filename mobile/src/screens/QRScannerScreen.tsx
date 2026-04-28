import React, { useState, useEffect } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { useNavigation } from '@react-navigation/native'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { colors } from '../lib/theme'

export default function QRScannerScreen() {
  const [permission, requestPermission] = useCameraPermissions()
  const [scanned, setScanned] = useState(false)
  const navigation = useNavigation<any>()
  const { profile } = useAuth()

  useEffect(() => {
    if (!permission?.granted) requestPermission()
  }, [])

  async function handleBarCodeScanned({ data }: { data: string }) {
    if (scanned) return
    setScanned(true)

    let assetId: string | null = null

    const urlMatch = data.match(/assets\/([0-9a-f-]{36})/i)
    if (urlMatch) {
      assetId = urlMatch[1]
    } else if (/^[0-9a-f-]{36}$/i.test(data)) {
      assetId = data
    } else {
      const { data: asset } = await supabase
        .from('assets')
        .select('id')
        .eq('qr_code', data)
        .eq('organisation_id', profile?.organisation_id)
        .single()
      assetId = asset?.id ?? null
    }

    if (!assetId) {
      Alert.alert(
        'Not Found',
        'This QR code does not match any asset in your organisation.',
        [{ text: 'Scan Again', onPress: () => setScanned(false) }]
      )
      return
    }

    navigation.replace('AssetDetail', { id: assetId })
  }

  if (!permission) {
    return (
      <View style={styles.center}>
        <Text style={styles.text}>Requesting camera permission...</Text>
      </View>
    )
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.text}>Camera access required to scan QR codes.</Text>
        <TouchableOpacity style={styles.btn} onPress={requestPermission}>
          <Text style={styles.btnText}>Grant Access</Text>
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
          {scanned ? 'Opening asset...' : 'Point at an asset QR code'}
        </Text>
        {scanned && (
          <TouchableOpacity style={styles.btn} onPress={() => setScanned(false)}>
            <Text style={styles.btnText}>Scan Again</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[styles.btn, { marginTop: 12, backgroundColor: 'rgba(255,255,255,0.2)' }]} onPress={() => navigation.goBack()}>
          <Text style={[styles.btnText, { color: 'white' }]}>Cancel</Text>
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
    borderWidth: 2, borderColor: '#6DCFB0',
    borderRadius: 16, backgroundColor: 'transparent',
    marginBottom: 32,
  },
  hint: { color: 'white', fontSize: 15, fontWeight: '600', marginBottom: 24, textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  btn: { backgroundColor: colors.primary, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 10 },
  btnText: { color: 'white', fontWeight: '600', fontSize: 15 },
})
