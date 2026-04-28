import React, { useEffect, useLayoutEffect, useState } from 'react'
import { View, Text, FlatList, TouchableOpacity, StyleSheet, TextInput, RefreshControl } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LangContext'
import { colors, radius, shadow } from '../lib/theme'

export default function AssetsScreen() {
  const { profile } = useAuth()
  const { t, lang } = useLang()
  const navigation = useNavigation<any>()
  const [assets, setAssets] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => navigation.navigate('QRScanner' as never)}
          style={{ padding: 8, marginRight: 8, backgroundColor: colors.primary + '30', borderRadius: 10 }}>
          <Ionicons name="qr-code-outline" size={22} color="white" />
        </TouchableOpacity>
      ),
    })
  }, [navigation])

  useEffect(() => { fetchAssets() }, [])

  async function fetchAssets() {
    if (!profile) return
    setLoading(true)
    const { data } = await supabase
      .from('assets')
      .select('*, site:site_id(name)')
      .eq('organisation_id', profile.organisation_id)
      .order('name', { ascending: true })
    if (data) setAssets(data)
    setLoading(false)
  }

  async function onRefresh() {
    setRefreshing(true)
    await fetchAssets()
    setRefreshing(false)
  }

  const filtered = assets.filter(a =>
    a.name?.toLowerCase().includes(search.toLowerCase()) ||
    a.category?.toLowerCase().includes(search.toLowerCase())
  )

  const statusColors: Record<string, { bg: string; text: string }> = {
    active: { bg: colors.successLight, text: colors.success },
    under_maintenance: { bg: colors.warningLight, text: colors.warning },
    retired: { bg: '#f5f5f5', text: colors.textSecondary },
  }

  function renderAsset({ item }: { item: any }) {
    const sc = statusColors[item.status] ?? statusColors.active
    const statusLabel: Record<string, string> = {
      active: lang === 'ar' ? 'نشط' : 'Active',
      under_maintenance: lang === 'ar' ? 'تحت الصيانة' : 'Under Maintenance',
      retired: lang === 'ar' ? 'متقاعد' : 'Retired',
    }
    return (
      <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('AssetDetail', { id: item.id })}>
        <View style={styles.cardLeft}>
          <View style={styles.assetIcon}>
            <Ionicons name='cube-outline' size={20} color={colors.primary} />
          </View>
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.assetName} numberOfLines={1}>{item.name}</Text>
          {item.status === 'under_maintenance' && (
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 4,
              backgroundColor: '#FEF3C7', paddingHorizontal: 8, paddingVertical: 3,
              borderRadius: 20, alignSelf: 'flex-start', marginTop: 4,
            }}>
              <Ionicons name="construct-outline" size={11} color="#92400E" />
              <Text style={{ fontSize: 11, color: '#92400E', fontWeight: '600' }}>
                {t('under_maintenance') ?? 'Under Maintenance'}
              </Text>
            </View>
          )}
          {item.status === 'retired' && (
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 4,
              backgroundColor: '#F1F5F9', paddingHorizontal: 8, paddingVertical: 3,
              borderRadius: 20, alignSelf: 'flex-start', marginTop: 4,
            }}>
              <Ionicons name="archive-outline" size={11} color="#64748B" />
              <Text style={{ fontSize: 11, color: '#64748B', fontWeight: '600' }}>
                {t('retired') ?? 'Retired'}
              </Text>
            </View>
          )}
          <Text style={styles.assetMeta}>{item.category ?? '-'} {item.site?.name ? '· ' + item.site.name : ''}</Text>
          {item.serial_number && <Text style={styles.assetSerial}>{item.serial_number}</Text>}
        </View>
        <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
          <Text style={[styles.statusText, { color: sc.text }]}>{statusLabel[item.status] ?? item.status}</Text>
        </View>
      </TouchableOpacity>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <Ionicons name='search-outline' size={18} color={colors.textLight} style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder={lang === 'ar' ? 'البحث في الأصول...' : 'Search assets...'}
          placeholderTextColor={colors.textLight}
        />
      </View>
      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        renderItem={renderAsset}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name='cube-outline' size={48} color={colors.textLight} />
            <Text style={styles.emptyText}>{lang === 'ar' ? 'لا توجد أصول' : 'No assets found'}</Text>
          </View>
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', margin: 16, borderRadius: radius.md, paddingHorizontal: 12, ...shadow.sm },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 14, color: colors.text },
  list: { padding: 16, paddingTop: 8 },
  card: { backgroundColor: 'white', borderRadius: radius.md, padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'center', ...shadow.sm },
  cardLeft: { marginRight: 12 },
  assetIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.infoLight, alignItems: 'center', justifyContent: 'center' },
  cardBody: { flex: 1 },
  assetName: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 3 },
  assetMeta: { fontSize: 12, color: colors.textSecondary, marginBottom: 2 },
  assetSerial: { fontSize: 11, color: colors.textLight, fontFamily: 'monospace' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  statusText: { fontSize: 11, fontWeight: '600' },
  empty: { alignItems: 'center', padding: 48 },
  emptyText: { fontSize: 15, color: colors.textSecondary, marginTop: 12 },
})