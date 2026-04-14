import React, { useEffect, useState } from 'react'
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native'
import { useRoute, useNavigation } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { useLang } from '../context/LangContext'
import { colors, radius, shadow } from '../lib/theme'
import { format } from 'date-fns'

export default function AssetDetailScreen() {
  const route = useRoute<any>()
  const navigation = useNavigation<any>()
  const { t, lang } = useLang()
  const [asset, setAsset] = useState<any>(null)
  const [workOrders, setWorkOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchAsset() }, [route.params?.id])

  async function fetchAsset() {
    const { data } = await supabase
      .from('assets')
      .select('*, site:site_id(name)')
      .eq('id', route.params.id)
      .single()
    if (data) setAsset(data)

    const { data: wos } = await supabase
      .from('work_orders')
      .select('id, title, status, priority, created_at')
      .eq('asset_id', route.params.id)
      .order('created_at', { ascending: false })
      .limit(10)
    if (wos) setWorkOrders(wos)
    setLoading(false)
  }

  if (loading) return (
    <View style={styles.centered}>
      <ActivityIndicator color={colors.primary} />
    </View>
  )

  if (!asset) return (
    <View style={styles.centered}>
      <Text>{lang === 'ar' ? 'الأصل غير موجود' : 'Asset not found'}</Text>
    </View>
  )

  const statusColors: Record<string, { bg: string; text: string; label: string }> = {
    active: { bg: colors.successLight, text: colors.success, label: lang === 'ar' ? 'نشط' : 'Active' },
    under_maintenance: { bg: colors.warningLight, text: colors.warning, label: lang === 'ar' ? 'تحت الصيانة' : 'Under Maintenance' },
    retired: { bg: '#f5f5f5', text: colors.textSecondary, label: lang === 'ar' ? 'متقاعد' : 'Retired' },
  }
  const sc = statusColors[asset.status] ?? statusColors.active

  const details = [
    { label: lang === 'ar' ? 'الفئة' : 'Category', value: asset.category },
    { label: lang === 'ar' ? 'الموقع' : 'Site', value: asset.site?.name },
    { label: lang === 'ar' ? 'الموقع الفرعي' : 'Sub-location', value: asset.sub_location },
    { label: lang === 'ar' ? 'الرقم التسلسلي' : 'Serial Number', value: asset.serial_number },
    { label: lang === 'ar' ? 'الشركة المصنعة' : 'Manufacturer', value: asset.manufacturer },
    { label: lang === 'ar' ? 'الموديل' : 'Model', value: asset.model },
    { label: lang === 'ar' ? 'تاريخ الشراء' : 'Purchase Date', value: asset.purchase_date ? format(new Date(asset.purchase_date), 'dd MMM yyyy') : null },
    { label: lang === 'ar' ? 'انتهاء الضمان' : 'Warranty Expiry', value: asset.warranty_expiry ? format(new Date(asset.warranty_expiry), 'dd MMM yyyy') : null },
    { label: lang === 'ar' ? 'تكلفة الشراء' : 'Purchase Cost', value: asset.purchase_cost ? 'SAR ' + Number(asset.purchase_cost).toLocaleString() : null },
  ]

  const priorityColors: Record<string, { bg: string; text: string }> = {
    critical: colors.priority.critical,
    high: colors.priority.high,
    medium: colors.priority.medium,
    low: colors.priority.low,
  }

  const statusBadgeColors: Record<string, { bg: string; text: string }> = {
    new: colors.status.new,
    assigned: colors.status.assigned,
    in_progress: colors.status.in_progress,
    on_hold: colors.status.on_hold,
    completed: colors.status.completed,
    closed: colors.status.closed,
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.assetIcon}>
            <Ionicons name='cube-outline' size={28} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.assetName}>{asset.name}</Text>
            {asset.name_ar && <Text style={styles.assetNameAr}>{asset.name_ar}</Text>}
          </View>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
          <Text style={[styles.statusText, { color: sc.text }]}>{sc.label}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{lang === 'ar' ? 'تفاصيل الأصل' : 'Asset Details'}</Text>
        {details.filter(d => d.value).map(d => (
          <View key={d.label} style={styles.row}>
            <Text style={styles.rowLabel}>{d.label}</Text>
            <Text style={styles.rowValue}>{d.value}</Text>
          </View>
        ))}
      </View>

      {workOrders.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{lang === 'ar' ? 'أوامر العمل' : 'Work Orders'}</Text>
          {workOrders.map(wo => {
            const pc = priorityColors[wo.priority] ?? priorityColors.medium
            const sc2 = statusBadgeColors[wo.status] ?? statusBadgeColors.new
            return (
              <TouchableOpacity key={wo.id} style={styles.woRow}
                onPress={() => navigation.navigate('WorkOrderDetail', { id: wo.id })}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.woTitle} numberOfLines={1}>{wo.title}</Text>
                  <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                    <View style={[styles.badge, { backgroundColor: pc.bg }]}>
                      <Text style={[styles.badgeText, { color: pc.text }]}>{wo.priority}</Text>
                    </View>
                    <View style={[styles.badge, { backgroundColor: sc2.bg }]}>
                      <Text style={[styles.badgeText, { color: sc2.text }]}>{wo.status}</Text>
                    </View>
                  </View>
                </View>
                <Ionicons name='chevron-forward' size={16} color={colors.textLight} />
              </TouchableOpacity>
            )
          })}
        </View>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { backgroundColor: 'white', padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 2 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  assetIcon: { width: 52, height: 52, borderRadius: 14, backgroundColor: colors.infoLight, alignItems: 'center', justifyContent: 'center' },
  assetName: { fontSize: 17, fontWeight: '600', color: colors.text },
  assetNameAr: { fontSize: 14, color: colors.textSecondary, direction: 'rtl' } as any,
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  statusText: { fontSize: 12, fontWeight: '600' },
  card: { backgroundColor: 'white', margin: 16, marginBottom: 0, borderRadius: radius.md, padding: 16, ...shadow.sm },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowLabel: { fontSize: 13, color: colors.textSecondary },
  rowValue: { fontSize: 13, fontWeight: '500', color: colors.text, maxWidth: '60%', textAlign: 'right' },
  woRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  woTitle: { fontSize: 13, fontWeight: '500', color: colors.text },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  badgeText: { fontSize: 10, fontWeight: '600' },
})