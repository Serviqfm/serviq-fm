import os

# ── 1. Login Screen ──
with open('src/screens/LoginScreen.tsx', 'w', encoding='utf-8') as f:
    f.write("""import React, { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert, Image,
} from 'react-native'
import { supabase } from '../lib/supabase'
import { useLang } from '../context/LangContext'
import { colors, radius, shadow } from '../lib/theme'

export default function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const { t, lang, setLang, isRTL } = useLang()

  async function handleLogin() {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter email and password')
      return
    }
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) Alert.alert('Login Failed', error.message)
    setLoading(false)
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.inner}>
        <View style={styles.logoContainer}>
          <View style={styles.logoBox}>
            <Text style={styles.logoText}>S</Text>
          </View>
          <Text style={styles.appName}>Serviq FM</Text>
          <Text style={styles.tagline}>{lang === 'ar' ? 'إدارة المنشآت بذكاء' : 'Facility Management Platform'}</Text>
        </View>

        <View style={styles.card}>
          <Text style={[styles.title, isRTL && styles.rtl]}>{t('sign_in')}</Text>

          <View style={styles.field}>
            <Text style={[styles.label, isRTL && styles.rtl]}>{t('email')}</Text>
            <TextInput
              style={[styles.input, isRTL && styles.inputRTL]}
              value={email}
              onChangeText={setEmail}
              placeholder='name@company.com'
              placeholderTextColor={colors.textLight}
              autoCapitalize='none'
              keyboardType='email-address'
              textAlign={isRTL ? 'right' : 'left'}
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, isRTL && styles.rtl]}>{t('password')}</Text>
            <TextInput
              style={[styles.input, isRTL && styles.inputRTL]}
              value={password}
              onChangeText={setPassword}
              placeholder='••••••••'
              placeholderTextColor={colors.textLight}
              secureTextEntry
              textAlign={isRTL ? 'right' : 'left'}
            />
          </View>

          <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
            {loading
              ? <ActivityIndicator color='white' />
              : <Text style={styles.buttonText}>{t('sign_in')}</Text>
            }
          </TouchableOpacity>
        </View>

        <View style={styles.langRow}>
          {(['en', 'ar'] as const).map(l => (
            <TouchableOpacity key={l} onPress={() => setLang(l)}
              style={[styles.langBtn, lang === l && styles.langBtnActive]}>
              <Text style={[styles.langBtnText, lang === l && styles.langBtnTextActive]}>
                {l === 'ar' ? 'العربية' : 'English'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  inner: { flex: 1, justifyContent: 'center', padding: 24 },
  logoContainer: { alignItems: 'center', marginBottom: 32 },
  logoBox: { width: 72, height: 72, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  logoText: { color: 'white', fontSize: 32, fontWeight: '700' },
  appName: { fontSize: 24, fontWeight: '700', color: colors.text, marginBottom: 4 },
  tagline: { fontSize: 14, color: colors.textSecondary },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 24, ...shadow.md, marginBottom: 24 },
  title: { fontSize: 20, fontWeight: '600', color: colors.text, marginBottom: 20 },
  field: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '500', color: colors.textSecondary, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: 12, fontSize: 15, color: colors.text, backgroundColor: '#fafafa' },
  inputRTL: { textAlign: 'right' },
  button: { backgroundColor: colors.primary, borderRadius: radius.sm, padding: 14, alignItems: 'center', marginTop: 8 },
  buttonText: { color: 'white', fontSize: 16, fontWeight: '600' },
  rtl: { textAlign: 'right' },
  langRow: { flexDirection: 'row', justifyContent: 'center', gap: 12 },
  langBtn: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border, backgroundColor: 'white' },
  langBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  langBtnText: { fontSize: 14, color: colors.textSecondary },
  langBtnTextActive: { color: 'white', fontWeight: '600' },
})""")
print('LoginScreen created')

# ── 2. Home Screen ──
with open('src/screens/HomeScreen.tsx', 'w', encoding='utf-8') as f:
    f.write("""import React, { useEffect, useState } from 'react'
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
    const { data: wos } = await supabase
      .from('work_orders')
      .select('*')
      .eq('organisation_id', profile.organisation_id)
      .eq('assigned_to', profile.id)
      .not('status', 'in', '("completed","closed")')
      .order('created_at', { ascending: false })
      .limit(20)

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
})""")
print('HomeScreen created')

# ── 3. Work Orders List Screen ──
with open('src/screens/WorkOrdersScreen.tsx', 'w', encoding='utf-8') as f:
    f.write("""import React, { useEffect, useState } from 'react'
import { View, Text, FlatList, TouchableOpacity, StyleSheet, TextInput, RefreshControl } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LangContext'
import { colors, radius, shadow } from '../lib/theme'
import { format } from 'date-fns'

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
})""")
print('WorkOrdersScreen created')

# ── 4. Work Order Detail Screen ──
with open('src/screens/WorkOrderDetailScreen.tsx', 'w', encoding='utf-8') as f:
    f.write("""import React, { useEffect, useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, Alert, ActivityIndicator, Image,
} from 'react-native'
import { useRoute, useNavigation } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LangContext'
import { colors, radius, shadow } from '../lib/theme'
import { format } from 'date-fns'

export default function WorkOrderDetailScreen() {
  const route = useRoute<any>()
  const navigation = useNavigation<any>()
  const { profile } = useAuth()
  const { t, lang, isRTL } = useLang()
  const [wo, setWo] = useState<any>(null)
  const [comments, setComments] = useState<any[]>([])
  const [newComment, setNewComment] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  useEffect(() => { fetchWO() }, [route.params?.id])

  async function fetchWO() {
    const { data } = await supabase
      .from('work_orders')
      .select('*, asset:asset_id(name, category), site:site_id(name), assignee:assigned_to(full_name), vendor:vendor_id(company_name)')
      .eq('id', route.params.id)
      .single()
    if (data) setWo(data)

    const { data: cmts } = await supabase
      .from('work_order_comments')
      .select('*, author:user_id(full_name)')
      .eq('work_order_id', route.params.id)
      .order('created_at', { ascending: true })
    if (cmts) setComments(cmts)
    setLoading(false)
  }

  async function updateStatus(newStatus: string) {
    setSaving(true)
    await supabase.from('work_orders').update({
      status: newStatus,
      updated_at: new Date().toISOString(),
    }).eq('id', wo.id)
    setWo((prev: any) => ({ ...prev, status: newStatus }))
    setSaving(false)
  }

  async function addComment() {
    if (!newComment.trim()) return
    setSaving(true)
    await supabase.from('work_order_comments').insert({
      work_order_id: wo.id,
      user_id: profile?.id,
      comment: newComment.trim(),
      organisation_id: profile?.organisation_id,
    })
    setNewComment('')
    await fetchWO()
    setSaving(false)
  }

  async function pickAndUploadPhoto() {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    })
    if (result.canceled) return
    setUploading(true)
    const uri = result.assets[0].uri
    const filename = 'wo-' + wo.id + '-' + Date.now() + '.jpg'
    const formData = new FormData()
    formData.append('file', { uri, name: filename, type: 'image/jpeg' } as any)

    const { data, error } = await supabase.storage
      .from('media')
      .upload('work-orders/' + filename, formData)

    if (!error) {
      const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl('work-orders/' + filename)
      const currentPhotos = wo.photo_urls ?? []
      await supabase.from('work_orders').update({
        photo_urls: [...currentPhotos, publicUrl],
        updated_at: new Date().toISOString(),
      }).eq('id', wo.id)
      await fetchWO()
    }
    setUploading(false)
  }

  if (loading) return (
    <View style={styles.centered}>
      <ActivityIndicator color={colors.primary} />
    </View>
  )

  if (!wo) return (
    <View style={styles.centered}>
      <Text>Work order not found</Text>
    </View>
  )

  const pri = colors.priority[wo.priority as keyof typeof colors.priority] ?? colors.priority.medium
  const sts = colors.status[wo.status as keyof typeof colors.status] ?? colors.status.new

  const statusActions: Record<string, { next: string; label: string; color: string }[]> = {
    new:         [{ next: 'in_progress', label: t('start_work'),    color: colors.info }],
    assigned:    [{ next: 'in_progress', label: t('start_work'),    color: colors.info }],
    in_progress: [{ next: 'completed',   label: t('complete'),      color: colors.success },
                  { next: 'on_hold',     label: t('put_on_hold'),   color: colors.warning }],
    on_hold:     [{ next: 'in_progress', label: t('start_work'),    color: colors.info }],
  }

  const actions = statusActions[wo.status] ?? []

  const detailRows = [
    { label: t('status'),      value: wo.status, isBadge: true, badgeBg: sts.bg, badgeColor: sts.text },
    { label: t('priority'),    value: wo.priority, isBadge: true, badgeBg: pri.bg, badgeColor: pri.text },
    { label: t('asset'),       value: wo.asset?.name },
    { label: t('site'),        value: wo.site?.name },
    { label: t('assigned_to'), value: wo.assignee?.full_name ?? t('unassigned') },
    { label: t('due_date'),    value: wo.due_at ? format(new Date(wo.due_at), 'dd MMM yyyy') : '-' },
  ]

  const statusLabels: Record<string, string> = {
    new: t('new'), assigned: t('assigned'), in_progress: t('in_progress'),
    on_hold: t('on_hold'), completed: t('completed'), closed: t('closed'),
  }
  const priorityLabels: Record<string, string> = {
    critical: t('critical'), high: t('high'), medium: t('medium'), low: t('low'),
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.titleCard}>
        <View style={styles.titleBadges}>
          <View style={[styles.badge, { backgroundColor: pri.bg }]}>
            <Text style={[styles.badgeText, { color: pri.text }]}>{priorityLabels[wo.priority] ?? wo.priority}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: sts.bg }]}>
            <Text style={[styles.badgeText, { color: sts.text }]}>{statusLabels[wo.status] ?? wo.status}</Text>
          </View>
        </View>
        <Text style={styles.woTitle}>{wo.title}</Text>
        {wo.description && <Text style={styles.woDesc}>{wo.description}</Text>}
      </View>

      {actions.length > 0 && (
        <View style={styles.actionsRow}>
          {actions.map(action => (
            <TouchableOpacity key={action.next} style={[styles.actionBtn, { backgroundColor: action.color }]}
              onPress={() => updateStatus(action.next)} disabled={saving}>
              {saving ? <ActivityIndicator color='white' size='small' />
                : <Text style={styles.actionBtnText}>{action.label}</Text>}
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={styles.detailCard}>
        {detailRows.map(row => row.value && (
          <View key={row.label} style={styles.detailRow}>
            <Text style={styles.detailLabel}>{row.label}</Text>
            {row.isBadge ? (
              <View style={[styles.badge, { backgroundColor: row.badgeBg }]}>
                <Text style={[styles.badgeText, { color: row.badgeColor }]}>
                  {row.label === t('status') ? statusLabels[row.value] ?? row.value : priorityLabels[row.value] ?? row.value}
                </Text>
              </View>
            ) : (
              <Text style={styles.detailValue}>{row.value}</Text>
            )}
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('photos')}</Text>
          <TouchableOpacity style={styles.addPhotoBtn} onPress={pickAndUploadPhoto} disabled={uploading}>
            {uploading
              ? <ActivityIndicator size='small' color={colors.primary} />
              : <><Ionicons name='camera-outline' size={16} color={colors.primary} /><Text style={styles.addPhotoText}>{t('take_photo')}</Text></>
            }
          </TouchableOpacity>
        </View>
        {wo.photo_urls && wo.photo_urls.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {wo.photo_urls.map((url: string, i: number) => (
              <Image key={i} source={{ uri: url }} style={styles.photo} />
            ))}
          </ScrollView>
        ) : (
          <Text style={styles.noPhotos}>{lang === 'ar' ? 'لا توجد صور بعد' : 'No photos yet'}</Text>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('comments')}</Text>
        {comments.map(c => (
          <View key={c.id} style={styles.comment}>
            <View style={styles.commentAvatar}>
              <Text style={styles.commentAvatarText}>{c.author?.full_name?.[0] ?? 'U'}</Text>
            </View>
            <View style={styles.commentBody}>
              <Text style={styles.commentAuthor}>{c.author?.full_name}</Text>
              <Text style={styles.commentText}>{c.comment}</Text>
              <Text style={styles.commentTime}>{format(new Date(c.created_at), 'dd MMM, HH:mm')}</Text>
            </View>
          </View>
        ))}
        <View style={styles.commentInput}>
          <TextInput
            style={styles.commentTextInput}
            value={newComment}
            onChangeText={setNewComment}
            placeholder={lang === 'ar' ? 'أضف تعليقاً...' : 'Add a comment...'}
            placeholderTextColor={colors.textLight}
            multiline
            textAlign={isRTL ? 'right' : 'left'}
          />
          <TouchableOpacity style={styles.sendBtn} onPress={addComment} disabled={saving}>
            <Ionicons name='send' size={18} color='white' />
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  titleCard: { backgroundColor: 'white', padding: 20, marginBottom: 2 },
  titleBadges: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  woTitle: { fontSize: 18, fontWeight: '600', color: colors.text, marginBottom: 8, lineHeight: 26 },
  woDesc: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
  actionsRow: { flexDirection: 'row', gap: 10, padding: 16 },
  actionBtn: { flex: 1, padding: 14, borderRadius: radius.md, alignItems: 'center' },
  actionBtnText: { color: 'white', fontSize: 14, fontWeight: '600' },
  detailCard: { backgroundColor: 'white', marginHorizontal: 16, borderRadius: radius.md, padding: 16, marginBottom: 16, ...shadow.sm },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  detailLabel: { fontSize: 13, color: colors.textSecondary },
  detailValue: { fontSize: 14, fontWeight: '500', color: colors.text },
  section: { backgroundColor: 'white', marginHorizontal: 16, borderRadius: radius.md, padding: 16, marginBottom: 16, ...shadow.sm },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  addPhotoBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addPhotoText: { fontSize: 13, color: colors.primary, fontWeight: '500' },
  photo: { width: 100, height: 100, borderRadius: radius.sm, marginRight: 8 },
  noPhotos: { fontSize: 13, color: colors.textLight, textAlign: 'center', paddingVertical: 16 },
  comment: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  commentAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  commentAvatarText: { color: 'white', fontWeight: '600', fontSize: 14 },
  commentBody: { flex: 1, backgroundColor: colors.background, borderRadius: radius.sm, padding: 10 },
  commentAuthor: { fontSize: 12, fontWeight: '600', color: colors.text, marginBottom: 3 },
  commentText: { fontSize: 14, color: colors.text, lineHeight: 20 },
  commentTime: { fontSize: 11, color: colors.textLight, marginTop: 4 },
  commentInput: { flexDirection: 'row', gap: 10, alignItems: 'flex-end', marginTop: 8 },
  commentTextInput: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: 10, fontSize: 14, color: colors.text, maxHeight: 100 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
})""")
print('WorkOrderDetailScreen created')

# ── 5. Profile Screen ──
with open('src/screens/ProfileScreen.tsx', 'w', encoding='utf-8') as f:
    f.write("""import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LangContext'
import { colors, radius, shadow } from '../lib/theme'

export default function ProfileScreen() {
  const { profile, signOut } = useAuth()
  const { t, lang, setLang, isRTL } = useLang()

  async function handleSignOut() {
    Alert.alert(
      lang === 'ar' ? 'تسجيل الخروج' : 'Sign Out',
      lang === 'ar' ? 'هل أنت متأكد؟' : 'Are you sure?',
      [
        { text: t('cancel'), style: 'cancel' },
        { text: t('sign_out'), style: 'destructive', onPress: signOut },
      ]
    )
  }

  const roleLabels: Record<string, string> = {
    admin: lang === 'ar' ? 'مشرف' : 'Admin',
    manager: lang === 'ar' ? 'مدير' : 'Manager',
    technician: lang === 'ar' ? 'فني' : 'Technician',
    requester: lang === 'ar' ? 'مقدم طلب' : 'Requester',
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{profile?.full_name?.[0]?.toUpperCase() ?? 'U'}</Text>
        </View>
        <Text style={styles.name}>{profile?.full_name}</Text>
        <Text style={styles.role}>{roleLabels[profile?.role] ?? profile?.role}</Text>
        <Text style={styles.org}>{profile?.organisation?.name}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{lang === 'ar' ? 'معلومات الحساب' : 'Account'}</Text>
        {[
          { icon: 'mail-outline', label: lang === 'ar' ? 'البريد الإلكتروني' : 'Email', value: profile?.email },
          { icon: 'shield-outline', label: t('role'), value: roleLabels[profile?.role] ?? profile?.role },
          { icon: 'business-outline', label: t('organisation'), value: profile?.organisation?.name },
        ].map(item => (
          <View key={item.label} style={styles.row}>
            <Ionicons name={item.icon as any} size={20} color={colors.textSecondary} />
            <View style={styles.rowContent}>
              <Text style={styles.rowLabel}>{item.label}</Text>
              <Text style={styles.rowValue}>{item.value}</Text>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('language')}</Text>
        <View style={styles.langRow}>
          {(['en', 'ar'] as const).map(l => (
            <TouchableOpacity key={l} style={[styles.langBtn, lang === l && styles.langBtnActive]}
              onPress={() => setLang(l)}>
              <Text style={[styles.langBtnText, lang === l && styles.langBtnTextActive]}>
                {l === 'ar' ? 'العربية' : 'English'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
        <Ionicons name='log-out-outline' size={20} color={colors.error} />
        <Text style={styles.signOutText}>{t('sign_out')}</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { backgroundColor: colors.primary, padding: 32, paddingTop: 60, alignItems: 'center' },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  avatarText: { color: 'white', fontSize: 32, fontWeight: '700' },
  name: { color: 'white', fontSize: 20, fontWeight: '700', marginBottom: 4 },
  role: { color: 'rgba(255,255,255,0.7)', fontSize: 14, marginBottom: 4 },
  org: { color: 'rgba(255,255,255,0.5)', fontSize: 13 },
  section: { backgroundColor: 'white', margin: 16, marginBottom: 0, borderRadius: radius.md, padding: 16, ...shadow.sm },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowContent: { flex: 1 },
  rowLabel: { fontSize: 12, color: colors.textSecondary, marginBottom: 2 },
  rowValue: { fontSize: 14, fontWeight: '500', color: colors.text },
  langRow: { flexDirection: 'row', gap: 12 },
  langBtn: { flex: 1, padding: 12, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  langBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  langBtnText: { fontSize: 14, color: colors.textSecondary },
  langBtnTextActive: { color: 'white', fontWeight: '600' },
  signOutBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, margin: 16, backgroundColor: 'white', borderRadius: radius.md, padding: 16, borderWidth: 1, borderColor: colors.errorLight, ...shadow.sm },
  signOutText: { fontSize: 15, color: colors.error, fontWeight: '500' },
})""")
print('ProfileScreen created')

# ── 6. Navigation ──
with open('src/navigation/index.tsx', 'w', encoding='utf-8') as f:
    f.write("""import React from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { Ionicons } from '@expo/vector-icons'
import { ActivityIndicator, View } from 'react-native'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LangContext'
import { colors } from '../lib/theme'

import LoginScreen from '../screens/LoginScreen'
import HomeScreen from '../screens/HomeScreen'
import WorkOrdersScreen from '../screens/WorkOrdersScreen'
import WorkOrderDetailScreen from '../screens/WorkOrderDetailScreen'
import ProfileScreen from '../screens/ProfileScreen'

const Stack = createNativeStackNavigator()
const Tab = createBottomTabNavigator()

function TabNavigator() {
  const { t } = useLang()
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          const icons: Record<string, string> = {
            Home: focused ? 'home' : 'home-outline',
            WorkOrders: focused ? 'clipboard' : 'clipboard-outline',
            Profile: focused ? 'person' : 'person-outline',
          }
          return <Ionicons name={icons[route.name] as any ?? 'circle'} size={size} color={color} />
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textLight,
        tabBarStyle: { paddingBottom: 8, height: 60 },
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: 'white',
        headerTitleStyle: { fontWeight: '600' },
      })}>
      <Tab.Screen name='Home' component={HomeScreen} options={{ title: t('home') }} />
      <Tab.Screen name='WorkOrders' component={WorkOrdersScreen} options={{ title: t('work_orders') }} />
      <Tab.Screen name='Profile' component={ProfileScreen} options={{ title: t('profile'), headerShown: false }} />
    </Tab.Navigator>
  )
}

function RootNavigator() {
  const { user, loading } = useAuth()

  if (loading) return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator size='large' color={colors.primary} />
    </View>
  )

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {user ? (
        <>
          <Stack.Screen name='Main' component={TabNavigator} />
          <Stack.Screen name='WorkOrderDetail' component={WorkOrderDetailScreen}
            options={{ headerShown: true, title: 'Work Order', headerStyle: { backgroundColor: colors.primary }, headerTintColor: 'white' }} />
        </>
      ) : (
        <Stack.Screen name='Login' component={LoginScreen} />
      )}
    </Stack.Navigator>
  )
}

export default function Navigation() {
  return (
    <NavigationContainer>
      <RootNavigator />
    </NavigationContainer>
  )
}""")
print('Navigation created')

# ── 7. Update App.tsx ──
with open('App.tsx', 'w', encoding='utf-8') as f:
    f.write("""import 'react-native-gesture-handler'
import React from 'react'
import { StatusBar } from 'expo-status-bar'
import { AuthProvider } from './src/context/AuthContext'
import { LangProvider } from './src/context/LangContext'
import Navigation from './src/navigation'

export default function App() {
  return (
    <LangProvider>
      <AuthProvider>
        <StatusBar style='light' />
        <Navigation />
      </AuthProvider>
    </LangProvider>
  )
}""")
print('App.tsx updated')

print('\\nAll screens created successfully!')
print('Run: npx expo start')