import React, { useEffect, useState } from 'react'
import { View, Text, FlatList, TouchableOpacity, StyleSheet, TextInput, RefreshControl } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LangContext'
import { colors, radius, shadow } from '../lib/theme'
import { format } from 'date-fns'

function useCountdown(dueAt: string | null) {
  const [timeLeft, setTimeLeft] = useState<string | null>(null)
  const [isUrgent, setIsUrgent] = useState(false)

  useEffect(() => {
    if (!dueAt) return
    function tick() {
      const diff = new Date(dueAt!).getTime() - Date.now()
      if (diff <= 0) {
        setTimeLeft('Overdue')
        setIsUrgent(true)
        return
      }
      const hrs = Math.floor(diff / 3600000)
      const mins = Math.floor((diff % 3600000) / 60000)
      if (hrs < 24) {
        setIsUrgent(true)
        setTimeLeft(hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`)
      } else {
        setIsUrgent(false)
        setTimeLeft(null) // don't show timer if > 24hrs
      }
    }
    tick()
    const id = setInterval(tick, 60000)
    return () => clearInterval(id)
  }, [dueAt])

  return { timeLeft, isUrgent }
}

function CountdownPill({ dueAt }: { dueAt: string | null }) {
  const { timeLeft } = useCountdown(dueAt)
  if (!timeLeft) return null
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 4,
      backgroundColor: timeLeft === 'Overdue' ? '#FEE2E2' : '#FEF3C7',
      paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20,
    }}>
      <Ionicons name="time-outline" size={11} color={timeLeft === 'Overdue' ? '#C62828' : '#92400E'} />
      <Text style={{ fontSize: 11, fontWeight: '700', color: timeLeft === 'Overdue' ? '#C62828' : '#92400E' }}>
        {timeLeft}
      </Text>
    </View>
  )
}

export default function WorkOrdersScreen() {
  const { profile } = useAuth()
  const { t, lang, isRTL } = useLang()
  const navigation = useNavigation<any>()
  const [wos, setWos] = useState<any[]>([])
  const [filtered, setFiltered] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => { fetchWOs() }, [])
  useEffect(() => { applyFilter() }, [wos, search, statusFilter])

  async function fetchWOs() {
    if (!profile) return
    setLoading(true)
    const query = supabase.from('work_orders')
      .select('*, asset:asset_id(name), site:site_id(name)')
      .eq('organisation_id', profile.organisation_id)
      .order('created_at', { ascending: false })

    if (profile.role === 'technician') {
      query.eq('assigned_to', profile.id)
    }
    // admins and managers see all org WOs

    const { data } = await query
    if (data) setWos(data)
    setLoading(false)
  }

  function applyFilter() {
    let result = wos
    if (statusFilter !== 'all') result = result.filter(w => w.status === statusFilter)
    if (search) result = result.filter(w => w.title?.toLowerCase().includes(search.toLowerCase()))
    setFiltered(result)
  }

  async function onRefresh() {
    setRefreshing(true)
    await fetchWOs()
    setRefreshing(false)
  }

  const statusFilters = [
    { key: 'all', label: t('all') },
    { key: 'new', label: t('new') },
    { key: 'assigned', label: t('assigned') },
    { key: 'in_progress', label: t('in_progress') },
    { key: 'on_hold', label: t('on_hold') },
    { key: 'completed', label: t('completed') },
  ]

  function renderWO({ item }: { item: any }) {
    const pri = colors.priority[item.priority as keyof typeof colors.priority] ?? colors.priority.medium
    const sts = colors.status[item.status as keyof typeof colors.status] ?? colors.status.new
    const statusLabel: Record<string, string> = {
      new: t('new'), assigned: t('assigned'), in_progress: t('in_progress'),
      on_hold: t('on_hold'), completed: t('completed'), closed: t('closed'),
    }
    const priorityLabel: Record<string, string> = {
      critical: t('critical'), high: t('high'), medium: t('medium'), low: t('low'),
    }
    return (
      <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('WorkOrderDetail', { id: item.id })}>
        <View style={styles.cardHeader}>
          <View style={[styles.priorityBadge, { backgroundColor: pri.bg }]}>
            <Text style={[styles.priorityText, { color: pri.text }]}>{priorityLabel[item.priority] ?? item.priority}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: sts.bg }]}>
            <Text style={[styles.statusText, { color: sts.text }]}>{statusLabel[item.status] ?? item.status}</Text>
          </View>
        </View>
        <Text style={styles.woTitle} numberOfLines={2}>{item.title}</Text>
        <View style={styles.woFooter}>
          <View style={styles.woFooterItem}>
            <Ionicons name='location-outline' size={12} color={colors.textLight} />
            <Text style={styles.woFooterText}>{item.site?.name ?? item.asset?.name ?? t('unassigned')}</Text>
          </View>
          {item.due_at && (
            <View style={styles.woFooterItem}>
              <Ionicons name='time-outline' size={12} color={colors.textLight} />
              <Text style={styles.woFooterText}>{format(new Date(item.due_at), 'dd MMM')}</Text>
            </View>
          )}
          <CountdownPill dueAt={item.due_at ?? null} />
        </View>
      </TouchableOpacity>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <Ionicons name='search-outline' size={18} color={colors.textLight} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder={lang === 'ar' ? 'البحث في أوامر العمل...' : 'Search work orders...'}
          placeholderTextColor={colors.textLight}
        />
      </View>

      <View style={styles.filterScroll}>
        {statusFilters.map(f => (
          <TouchableOpacity key={f.key} onPress={() => setStatusFilter(f.key)}
            style={[styles.filterBtn, statusFilter === f.key && styles.filterBtnActive]}>
            <Text style={[styles.filterBtnText, statusFilter === f.key && styles.filterBtnTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        renderItem={renderWO}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name='clipboard-outline' size={48} color={colors.textLight} />
            <Text style={styles.emptyText}>{t('no_work_orders')}</Text>
          </View>
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', margin: 16, borderRadius: radius.md, paddingHorizontal: 12, ...shadow.sm },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 14, color: colors.text },
  filterScroll: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 8, flexWrap: 'wrap' },
  filterBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: radius.full, backgroundColor: 'white', borderWidth: 1, borderColor: colors.border },
  filterBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterBtnText: { fontSize: 13, color: colors.textSecondary },
  filterBtnTextActive: { color: 'white', fontWeight: '600' },
  list: { padding: 16, paddingTop: 8 },
  card: { backgroundColor: 'white', borderRadius: radius.md, padding: 14, marginBottom: 10, ...shadow.sm },
  cardHeader: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  priorityBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.full },
  priorityText: { fontSize: 11, fontWeight: '600' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.full },
  statusText: { fontSize: 11, fontWeight: '600' },
  woTitle: { fontSize: 14, fontWeight: '500', color: colors.text, marginBottom: 10 },
  woFooter: { flexDirection: 'row', gap: 16 },
  woFooterItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  woFooterText: { fontSize: 12, color: colors.textSecondary },
  empty: { alignItems: 'center', padding: 48 },
  emptyText: { fontSize: 15, color: colors.textSecondary, marginTop: 12 },
})