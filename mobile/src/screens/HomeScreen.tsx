import React, { useEffect, useState } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LangContext'
import { colors, radius, shadow } from '../lib/theme'
import { format } from 'date-fns'

export default function HomeScreen() {
  const { profile } = useAuth()
  const { t, lang, isRTL } = useLang()
  const navigation = useNavigation<any>()
  const [stats, setStats] = useState({ open: 0, overdue: 0, dueToday: 0, inProgress: 0 })
  const [recentWOs, setRecentWOs] = useState<any[]>([])
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    if (!profile) return
    let query = supabase
      .from('work_orders')
      .select('*')
      .eq('organisation_id', profile.organisation_id)
      .not('status', 'in', '("completed","closed")')
      .order('created_at', { ascending: false })
      .limit(20)

    // Technicians only see their assigned WOs
    if (profile.role === 'technician') {
      query = query.eq('assigned_to', profile.id)
    }

    const { data: wos } = await query

    if (wos) {
      const now = new Date()
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const tomorrow = new Date(today)
      tomorrow.setDate(tomorrow.getDate() + 1)

      setStats({
        open: wos.filter(w => !['completed','closed'].includes(w.status)).length,
        overdue: wos.filter(w => w.due_at && new Date(w.due_at) < now).length,
        dueToday: wos.filter(w => w.due_at && new Date(w.due_at) >= today && new Date(w.due_at) < tomorrow).length,
        inProgress: wos.filter(w => w.status === 'in_progress').length,
      })
      setRecentWOs(wos.slice(0, 5))
    }
  }

  async function onRefresh() {
    setRefreshing(true)
    await fetchData()
    setRefreshing(false)
  }

  function getGreeting() {
    const h = new Date().getHours()
    if (h < 12) return t('good_morning')
    if (h < 17) return t('good_afternoon')
    return t('good_evening')
  }

  const priorityConfig: Record<string, { bg: string; text: string; label: string }> = {
    critical: { ...colors.priority.critical, label: t('critical') },
    high:     { ...colors.priority.high,     label: t('high') },
    medium:   { ...colors.priority.medium,   label: t('medium') },
    low:      { ...colors.priority.low,      label: t('low') },
  }

  return (
    <ScrollView style={styles.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{getGreeting()},</Text>
          <Text style={styles.name}>{profile?.full_name?.split(' ')[0] ?? 'User'} 👋</Text>
          <Text style={styles.org}>{profile?.organisation?.name}</Text>
        </View>
        <TouchableOpacity style={styles.notifBtn}>
          <Ionicons name='notifications-outline' size={22} color='white' />
        </TouchableOpacity>
      </View>

      <View style={styles.statsRow}>
        {[
          { label: t('open'),      value: stats.open,       color: colors.info,    icon: 'clipboard-outline' },
          { label: t('overdue'),   value: stats.overdue,    color: colors.error,   icon: 'alert-circle-outline' },
          { label: t('due_today'), value: stats.dueToday,   color: colors.warning, icon: 'time-outline' },
          { label: t('in_progress'), value: stats.inProgress, color: colors.success, icon: 'construct-outline' },
        ].map(stat => (
          <View key={stat.label} style={styles.statCard}>
            <Ionicons name={stat.icon as any} size={20} color={stat.color} />
            <Text style={[styles.statValue, { color: stat.color }]}>{stat.value}</Text>
            <Text style={styles.statLabel}>{stat.label}</Text>
          </View>
        ))}
      </View>

      <View style={styles.quickActions}>
        <TouchableOpacity style={styles.qaBtn} onPress={() => navigation.navigate('QRScanner')}>
          <View style={[styles.qaIcon, { backgroundColor: colors.infoLight }]}>
            <Ionicons name='qr-code-outline' size={24} color={colors.info} />
          </View>
          <Text style={styles.qaLabel}>{t('scan_qr')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.qaBtn} onPress={() => navigation.navigate('WorkOrders')}>
          <View style={[styles.qaIcon, { backgroundColor: colors.successLight }]}>
            <Ionicons name='clipboard-outline' size={24} color={colors.success} />
          </View>
          <Text style={styles.qaLabel}>{t('work_orders')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.qaBtn} onPress={() => navigation.navigate('Assets')}>
          <View style={[styles.qaIcon, { backgroundColor: colors.warningLight }]}>
            <Ionicons name='cube-outline' size={24} color={colors.warning} />
          </View>
          <Text style={styles.qaLabel}>{t('assets')}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('my_work_orders')}</Text>
          <TouchableOpacity onPress={() => navigation.navigate('WorkOrders')}>
            <Text style={styles.seeAll}>{lang === 'ar' ? 'عرض الكل' : 'See all'}</Text>
          </TouchableOpacity>
        </View>

        {recentWOs.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name='checkmark-circle-outline' size={40} color={colors.success} />
            <Text style={styles.emptyText}>{lang === 'ar' ? 'لا توجد أوامر عمل معلقة' : 'No pending work orders'}</Text>
          </View>
        ) : (
          recentWOs.map(wo => {
            const pri = priorityConfig[wo.priority] ?? priorityConfig.medium
            return (
              <TouchableOpacity key={wo.id} style={styles.woCard}
                onPress={() => navigation.navigate('WorkOrderDetail', { id: wo.id })}>
                <View style={styles.woCardLeft}>
                  <View style={[styles.priorityDot, { backgroundColor: pri.text }]} />
                </View>
                <View style={styles.woCardBody}>
                  <Text style={styles.woTitle} numberOfLines={2}>{wo.title}</Text>
                  <View style={styles.woMeta}>
                    <View style={[styles.badge, { backgroundColor: pri.bg }]}>
                      <Text style={[styles.badgeText, { color: pri.text }]}>{pri.label}</Text>
                    </View>
                    {wo.due_at && (
                      <Text style={styles.dueDate}>
                        {format(new Date(wo.due_at), 'dd MMM')}
                      </Text>
                    )}
                  </View>
                </View>
                <Ionicons name='chevron-forward' size={16} color={colors.textLight} />
              </TouchableOpacity>
            )
          })
        )}
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { backgroundColor: colors.primary, padding: 24, paddingTop: 56, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  greeting: { color: 'rgba(255,255,255,0.7)', fontSize: 14 },
  name: { color: 'white', fontSize: 22, fontWeight: '700', marginTop: 2 },
  org: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 4 },
  notifBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  statsRow: { flexDirection: 'row', padding: 16, gap: 10, marginTop: -20 },
  statCard: { flex: 1, backgroundColor: 'white', borderRadius: radius.md, padding: 12, alignItems: 'center', ...shadow.sm },
  statValue: { fontSize: 20, fontWeight: '700', marginTop: 4 },
  statLabel: { fontSize: 10, color: colors.textSecondary, marginTop: 2, textAlign: 'center' },
  quickActions: { flexDirection: 'row', paddingHorizontal: 16, gap: 12, marginBottom: 8 },
  qaBtn: { flex: 1, alignItems: 'center', backgroundColor: 'white', borderRadius: radius.md, padding: 16, ...shadow.sm },
  qaIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  qaLabel: { fontSize: 12, color: colors.text, fontWeight: '500', textAlign: 'center' },
  section: { padding: 16 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  seeAll: { fontSize: 13, color: colors.primary, fontWeight: '500' },
  emptyCard: { backgroundColor: 'white', borderRadius: radius.md, padding: 32, alignItems: 'center', ...shadow.sm },
  emptyText: { fontSize: 14, color: colors.textSecondary, marginTop: 12 },
  woCard: { backgroundColor: 'white', borderRadius: radius.md, padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'center', ...shadow.sm },
  woCardLeft: { marginRight: 12 },
  priorityDot: { width: 10, height: 10, borderRadius: 5 },
  woCardBody: { flex: 1 },
  woTitle: { fontSize: 14, fontWeight: '500', color: colors.text, marginBottom: 6 },
  woMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.full },
  badgeText: { fontSize: 11, fontWeight: '600' },
  dueDate: { fontSize: 12, color: colors.textSecondary },
})