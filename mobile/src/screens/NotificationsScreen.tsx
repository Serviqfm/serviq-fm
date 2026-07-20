import React, { useEffect, useState } from 'react'
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LangContext'
import { colors, radius, shadow } from '../lib/theme'

type Notif = {
  id: string
  type_key: string
  title: string
  body: string | null
  link: string | null
  read_at: string | null
  created_at: string
}

function timeAgo(iso: string, isAr: boolean): string {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  const m = Math.floor(s / 60), h = Math.floor(m / 60), d = Math.floor(h / 24)
  if (d > 0) return isAr ? `منذ ${d}ي` : `${d}d ago`
  if (h > 0) return isAr ? `منذ ${h}س` : `${h}h ago`
  if (m > 0) return isAr ? `منذ ${m}د` : `${m}m ago`
  return isAr ? 'الآن' : 'now'
}

// Mirror the web NotificationBell: links are same-origin web paths like
// /dashboard/work-orders/{uuid}. On mobile we route the work-order ones to the
// native detail screen; anything else just marks read (no in-app target yet).
function woIdFromLink(link: string | null): string | null {
  const m = link?.match(/work-orders\/([0-9a-f-]{36})/i)
  return m?.[1] ?? null
}

export default function NotificationsScreen() {
  const { profile } = useAuth()
  const { t, lang, isRTL } = useLang()
  const navigation = useNavigation<any>()
  const [items, setItems] = useState<Notif[]>([])
  const [refreshing, setRefreshing] = useState(false)

  // RLS self-scopes user_notifications to the signed-in user, so no explicit
  // user filter is needed (matches the web bell).
  async function load() {
    const { data } = await supabase
      .from('user_notifications')
      .select('id, type_key, title, body, link, read_at, created_at')
      .order('created_at', { ascending: false })
      .limit(50)
    if (data) setItems(data as Notif[])
  }

  useEffect(() => { load() }, [profile?.id])
  // Mark everything read when the screen is opened (like tapping the bell open).
  useEffect(() => {
    const unsub = navigation.addListener('focus', () => { load().then(markAllRead) })
    return unsub
  }, [navigation, profile?.id])

  async function markAllRead() {
    const nowISO = new Date().toISOString()
    // Optimistic UI (functional updater picks up freshly loaded rows), then clear
    // every unread row server-side. RLS scopes the update to this user.
    setItems(prev => prev.map(n => n.read_at ? n : { ...n, read_at: nowISO }))
    await supabase.from('user_notifications').update({ read_at: nowISO }).is('read_at', null)
  }

  async function markRead(id: string) {
    const nowISO = new Date().toISOString()
    setItems(prev => prev.map(n => n.id === id ? { ...n, read_at: nowISO } : n))
    await supabase.from('user_notifications').update({ read_at: nowISO }).eq('id', id)
  }

  function onPressRow(n: Notif) {
    if (!n.read_at) markRead(n.id)
    const woId = woIdFromLink(n.link)
    if (woId) navigation.navigate('WorkOrderDetail', { id: woId })
  }

  async function onRefresh() {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  function renderRow({ item: n }: { item: Notif }) {
    return (
      <TouchableOpacity style={[styles.card, !n.read_at && styles.cardUnread]} onPress={() => onPressRow(n)}>
        {!n.read_at && <View style={styles.dot} />}
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, !n.read_at && styles.titleUnread]} numberOfLines={1}>{n.title}</Text>
          {n.body ? <Text style={styles.body} numberOfLines={2}>{n.body}</Text> : null}
          <Text style={styles.time}>{timeAgo(n.created_at, lang === 'ar')}</Text>
        </View>
        {woIdFromLink(n.link) && (
          <Ionicons name={isRTL ? 'chevron-back' : 'chevron-forward'} size={16} color={colors.textLight} />
        )}
      </TouchableOpacity>
    )
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={items}
        keyExtractor={n => n.id}
        renderItem={renderRow}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name='notifications-outline' size={48} color={colors.textLight} />
            <Text style={styles.emptyText}>{lang === 'ar' ? 'لا توجد إشعارات' : 'No notifications'}</Text>
          </View>
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  list: { padding: 16, paddingTop: 12 },
  card: { backgroundColor: 'white', borderRadius: radius.md, padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 10, ...shadow.sm },
  cardUnread: { backgroundColor: colors.infoLight },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  title: { fontSize: 14, color: colors.textSecondary, textAlign: 'left', writingDirection: 'auto' },
  titleUnread: { color: colors.text, fontWeight: '700' },
  body: { fontSize: 12, color: colors.textSecondary, marginTop: 3, textAlign: 'left', writingDirection: 'auto' },
  time: { fontSize: 11, color: colors.textLight, marginTop: 4, textAlign: 'left' },
  empty: { alignItems: 'center', padding: 48 },
  emptyText: { fontSize: 15, color: colors.textSecondary, marginTop: 12 },
})
