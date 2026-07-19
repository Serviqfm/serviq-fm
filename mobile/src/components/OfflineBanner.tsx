// CORE-07: connectivity banner. Offline → "Offline — showing cached data";
// back online with failed queued mutations → red bar, tap to retry.
import React from 'react'
import { Text, TouchableOpacity } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useOffline } from '../lib/offline'
import { useLang } from '../context/LangContext'

export default function OfflineBanner() {
  const { online, pending, failed, retry } = useOffline()
  const insets = useSafeAreaInsets()
  const { t } = useLang()

  let bg: string, text: string
  if (!online) {
    bg = '#37474F'
    text = t('offline_banner') + (pending + failed > 0 ? ` · ${t('offline_pending', { count: pending + failed })}` : '')
  } else if (failed > 0) {
    bg = '#C62828'
    text = t('offline_sync_failed', { count: failed })
  } else if (pending > 0) {
    bg = '#92400E'
    text = t('offline_syncing', { count: pending })
  } else {
    return null
  }

  return (
    <TouchableOpacity
      onPress={retry}
      activeOpacity={0.8}
      style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
        backgroundColor: bg, paddingVertical: 8, paddingHorizontal: 12,
        paddingBottom: Math.max(insets.bottom, 8),
      }}>
      <Ionicons name={online ? 'sync-outline' : 'cloud-offline-outline'} size={14} color='white' />
      <Text style={{ color: 'white', fontSize: 12, fontWeight: '600' }}>{text}</Text>
    </TouchableOpacity>
  )
}
