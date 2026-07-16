import React, { useEffect, useState } from 'react'
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native'
import { Image } from 'expo-image'
import { useRoute } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LangContext'
import { colors, radius, shadow } from '../lib/theme'
import { format } from 'date-fns'

const STATUS: Record<string, { bg: string; text: string; en: string; ar: string }> = {
  in_storage:   { bg: colors.infoLight,    text: colors.primary,       en: 'In Storage',   ar: 'في المخزن' },
  in_use:       { bg: colors.successLight,  text: colors.success,       en: 'In Use',       ar: 'قيد الاستخدام' },
  under_repair: { bg: colors.warningLight,  text: colors.warning,       en: 'Under Repair', ar: 'تحت الإصلاح' },
  damaged:      { bg: colors.errorLight,    text: colors.error,         en: 'Damaged',      ar: 'تالف' },
  disposed:     { bg: '#f5f5f5',            text: colors.textSecondary, en: 'Disposed',     ar: 'مُتخلص منه' },
}

export default function AssetLogDetailScreen() {
  const route = useRoute<any>()
  const { profile } = useAuth()
  const { t, lang } = useLang()
  const [item, setItem] = useState<any>(null)
  const [movements, setMovements] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile?.organisation_id) return
    ;(async () => {
      // Org-scoped read (defense-in-depth on top of RLS).
      const { data } = await supabase
        .from('asset_log_items')
        .select('*, type:type_id(name, name_ar), site:site_id(name), space:space_id(name, name_ar)')
        .eq('id', route.params.id)
        .eq('organisation_id', profile.organisation_id)
        .maybeSingle()
      if (data) setItem(data)

      const { data: moves } = await supabase
        .from('asset_log_movements')
        .select('id, from_space_name, to_space_name, note, moved_at')
        .eq('item_id', route.params.id)
        .eq('organisation_id', profile.organisation_id)
        .order('moved_at', { ascending: false })
        .limit(5)
      if (moves) setMovements(moves)
      setLoading(false)
    })()
  }, [route.params?.id, profile?.organisation_id])

  if (loading) return (
    <View style={styles.centered}><ActivityIndicator color={colors.primary} /></View>
  )
  if (!item) return (
    <View style={styles.centered}><Text>{t('asset_log_not_found')}</Text></View>
  )

  const sc = STATUS[item.status] ?? STATUS.in_storage
  const spaceName = lang === 'ar' ? (item.space?.name_ar || item.space?.name) : item.space?.name
  const typeName = lang === 'ar' ? (item.type?.name_ar || item.type?.name) : item.type?.name

  const details = [
    { label: t('type'), value: typeName },
    { label: t('serial_number'), value: item.serial_number },
    { label: t('brand'), value: item.brand },
    { label: t('model'), value: item.model },
    { label: t('quantity'), value: item.tracking_mode === 'bulk' ? String(item.quantity) : null },
    { label: t('site'), value: item.site?.name },
    { label: t('current_space'), value: spaceName || t('unassigned') },
    { label: t('purchase_date'), value: item.purchase_date ? format(new Date(item.purchase_date), 'dd MMM yyyy') : null },
    { label: t('warranty_expiry'), value: item.warranty_expiry ? format(new Date(item.warranty_expiry), 'dd MMM yyyy') : null },
  ].filter(d => d.value)

  const photos: string[] = item.photo_urls ?? []

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.icon}>
            <Ionicons name='pricetag-outline' size={26} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{item.name}</Text>
            {item.name_ar ? <Text style={styles.nameAr}>{item.name_ar}</Text> : null}
            <Text style={styles.itemNo}>AL-{item.item_number}</Text>
          </View>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
          <Text style={[styles.statusText, { color: sc.text }]}>{lang === 'ar' ? sc.ar : sc.en}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{t('condition')}</Text>
        <View style={styles.starRow}>
          {[1, 2, 3, 4, 5].map(n => (
            <Ionicons key={n} name={n <= (item.condition_rating ?? 0) ? 'star' : 'star-outline'}
              size={22} color={n <= (item.condition_rating ?? 0) ? colors.warning : colors.textLight} />
          ))}
          <Text style={styles.usable}>
            {item.is_usable ? t('usable') : t('not_usable')}
          </Text>
        </View>
        {item.condition_notes ? <Text style={styles.notes}>{item.condition_notes}</Text> : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{t('details')}</Text>
        {details.map(d => (
          <View key={d.label} style={styles.row}>
            <Text style={styles.rowLabel}>{d.label}</Text>
            <Text style={styles.rowValue}>{d.value}</Text>
          </View>
        ))}
      </View>

      {photos.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t('photos')}</Text>
          <View style={styles.photoWrap}>
            {photos.map((url, i) => (
              <Image key={i} source={{ uri: url }} style={styles.photo} contentFit='cover' transition={200} />
            ))}
          </View>
        </View>
      )}

      {movements.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t('movements')}</Text>
          {movements.map(m => (
            <View key={m.id} style={styles.moveRow}>
              <Ionicons name='swap-horizontal' size={16} color={colors.textLight} style={{ marginTop: 2 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.moveText}>
                  {(m.from_space_name || t('unassigned'))} → {(m.to_space_name || t('unassigned'))}
                </Text>
                {m.note ? <Text style={styles.moveNote}>{m.note}</Text> : null}
                <Text style={styles.moveDate}>{format(new Date(m.moved_at), 'dd MMM yyyy, HH:mm')}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      <View style={{ height: 24 }} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { backgroundColor: 'white', padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 2 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  icon: { width: 52, height: 52, borderRadius: 14, backgroundColor: colors.infoLight, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 17, fontWeight: '600', color: colors.text },
  nameAr: { fontSize: 14, color: colors.textSecondary, direction: 'rtl' } as any,
  itemNo: { fontSize: 12, color: colors.textLight, marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  statusText: { fontSize: 12, fontWeight: '600' },
  card: { backgroundColor: 'white', margin: 16, marginBottom: 0, borderRadius: radius.md, padding: 16, ...shadow.sm },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  starRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  usable: { marginLeft: 8, fontSize: 13, fontWeight: '500', color: colors.textSecondary },
  notes: { fontSize: 13, color: colors.text, marginTop: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowLabel: { fontSize: 13, color: colors.textSecondary },
  rowValue: { fontSize: 13, fontWeight: '500', color: colors.text, maxWidth: '60%', textAlign: 'right' },
  photoWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photo: { width: 88, height: 88, borderRadius: radius.sm },
  moveRow: { flexDirection: 'row', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  moveText: { fontSize: 13, fontWeight: '500', color: colors.text },
  moveNote: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  moveDate: { fontSize: 11, color: colors.textLight, marginTop: 2 },
})
