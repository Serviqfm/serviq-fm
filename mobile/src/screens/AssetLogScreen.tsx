import React, { useEffect, useState } from 'react'
import { View, Text, FlatList, TouchableOpacity, StyleSheet, TextInput, RefreshControl } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LangContext'
import { colors, radius, shadow } from '../lib/theme'

// AG-15 — browsable/searchable Asset Log. Before this, log items with no printed
// QR were unreachable on mobile (scan-only). Navigation target reuses the existing
// AssetLogDetail screen.
const STATUS: Record<string, { bg: string; text: string; en: string; ar: string }> = {
  in_storage:   { bg: colors.infoLight,    text: colors.primary,       en: 'In Storage',   ar: 'في المخزن' },
  in_use:       { bg: colors.successLight,  text: colors.success,       en: 'In Use',       ar: 'قيد الاستخدام' },
  under_repair: { bg: colors.warningLight,  text: colors.warning,       en: 'Under Repair', ar: 'تحت الإصلاح' },
  damaged:      { bg: colors.errorLight,    text: colors.error,         en: 'Damaged',      ar: 'تالف' },
  disposed:     { bg: '#f5f5f5',            text: colors.textSecondary, en: 'Disposed',     ar: 'مُتخلص منه' },
}

export default function AssetLogScreen() {
  const { profile } = useAuth()
  const { lang } = useLang()
  const navigation = useNavigation<any>()
  const [items, setItems] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => { fetchItems() }, [profile?.organisation_id])
  useEffect(() => {
    const unsub = navigation.addListener('focus', fetchItems)
    return unsub
  }, [navigation, profile?.organisation_id])

  async function fetchItems() {
    if (!profile?.organisation_id) return
    const { data } = await supabase
      .from('asset_log_items')
      .select('id, name, name_ar, item_number, status, serial_number, type:type_id(name, name_ar), site:site_id(name)')
      .eq('organisation_id', profile.organisation_id)
      .order('name', { ascending: true })
    if (data) setItems(data)
  }

  async function onRefresh() {
    setRefreshing(true)
    await fetchItems()
    setRefreshing(false)
  }

  const q = search.toLowerCase()
  const filtered = items.filter(i =>
    i.name?.toLowerCase().includes(q) ||
    i.name_ar?.toLowerCase().includes(q) ||
    i.serial_number?.toLowerCase().includes(q) ||
    String(i.item_number ?? '').includes(q)
  )

  function renderItem({ item }: { item: any }) {
    const sc = STATUS[item.status] ?? STATUS.in_storage
    const name = lang === 'ar' ? (item.name_ar || item.name) : item.name
    const typeName = lang === 'ar' ? (item.type?.name_ar || item.type?.name) : item.type?.name
    return (
      <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('AssetLogDetail', { id: item.id })}>
        <View style={styles.iconWrap}>
          <Ionicons name='pricetag-outline' size={20} color={colors.primary} />
        </View>
        <View style={styles.body}>
          <Text style={styles.name} numberOfLines={1}>{name}</Text>
          <Text style={styles.meta}>
            AL-{item.item_number}{typeName ? ' · ' + typeName : ''}{item.site?.name ? ' · ' + item.site.name : ''}
          </Text>
          {item.serial_number ? <Text style={styles.serial}>{item.serial_number}</Text> : null}
        </View>
        <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
          <Text style={[styles.statusText, { color: sc.text }]}>{lang === 'ar' ? sc.ar : sc.en}</Text>
        </View>
      </TouchableOpacity>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <Ionicons name='search-outline' size={18} color={colors.textLight} style={{ marginEnd: 8 }} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder={lang === 'ar' ? 'البحث في سجل الأصول...' : 'Search asset log...'}
          placeholderTextColor={colors.textLight}
        />
      </View>
      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name='pricetag-outline' size={48} color={colors.textLight} />
            <Text style={styles.emptyText}>{lang === 'ar' ? 'لا توجد عناصر' : 'No items found'}</Text>
          </View>
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', margin: 16, borderRadius: radius.md, paddingHorizontal: 12, ...shadow.sm },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 14, color: colors.text, textAlign: 'left', writingDirection: 'auto' },
  list: { padding: 16, paddingTop: 8 },
  card: { backgroundColor: 'white', borderRadius: radius.md, padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 12, ...shadow.sm },
  iconWrap: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.infoLight, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1 },
  name: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 3, textAlign: 'left', writingDirection: 'auto' },
  meta: { fontSize: 12, color: colors.textSecondary, marginBottom: 2, textAlign: 'left' },
  serial: { fontSize: 11, color: colors.textLight, fontFamily: 'monospace' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  statusText: { fontSize: 11, fontWeight: '600' },
  empty: { alignItems: 'center', padding: 48 },
  emptyText: { fontSize: 15, color: colors.textSecondary, marginTop: 12 },
})
