content = """import React, { useEffect, useState, useRef } from 'react'
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
  const { t, lang } = useLang()
  const [wo, setWo] = useState<any>(null)
  const [allComments, setAllComments] = useState<any[]>([])
  const [newComment, setNewComment] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [activeTab, setActiveTab] = useState<'details' | 'comments' | 'photos' | 'time'>('details')
  const [timerRunning, setTimerRunning] = useState(false)
  const [timerSeconds, setTimerSeconds] = useState(0)
  const timerRef = useRef<any>(null)
  const startTimeRef = useRef<Date | null>(null)

  useEffect(() => { fetchWO() }, [route.params?.id])
  useEffect(() => { return () => { if (timerRef.current) clearInterval(timerRef.current) } }, [])

  async function fetchWO() {
    const { data, error: woError } = await supabase
      .from('work_orders')
      .select('*, asset:asset_id(name, category), site:site_id(name), assignee:assigned_to(full_name)')
      .eq('id', route.params.id)
      .single()
    if (woError) console.log('WO Error:', JSON.stringify(woError))
    if (data) setWo(data)

    const { data: cmts, error: cmtError } = await supabase
      .from('work_order_comments')
      .select('*, author:user_id(full_name)')
      .eq('work_order_id', route.params.id)
      .order('created_at', { ascending: true })
    if (cmtError) console.log('CMT Error:', JSON.stringify(cmtError))
    if (cmts) setAllComments(cmts)

    setLoading(false)
  }

  async function updateStatus(newStatus: string) {
    setSaving(true)
    const now = new Date().toISOString()
    const updates: any = { status: newStatus, updated_at: now }
    if (newStatus === 'in_progress' && !wo.started_at) updates.started_at = now
    if (newStatus === 'completed') updates.completed_at = now
    await supabase.from('work_orders').update(updates).eq('id', wo.id)
    await supabase.from('work_order_comments').insert({
      work_order_id: wo.id,
      user_id: profile?.id,
      comment: 'Status changed to: ' + newStatus,
      comment_type: 'status_change',
      organisation_id: profile?.organisation_id,
    })
    setWo((prev: any) => ({ ...prev, ...updates }))
    await fetchWO()
    setSaving(false)
  }

  function startTimer() {
    startTimeRef.current = new Date()
    setTimerRunning(true)
    timerRef.current = setInterval(() => setTimerSeconds(prev => prev + 1), 1000)
  }

  async function stopTimer() {
    if (!timerRef.current || !startTimeRef.current) return
    clearInterval(timerRef.current)
    timerRef.current = null
    setTimerRunning(false)
    const secs = timerSeconds
    const mins = Math.round(secs / 60)
    const h = Math.floor(secs / 3600)
    const m = Math.floor((secs % 3600) / 60)
    const s = secs % 60
    const timeStr = h > 0 ? (h + 'h ' + m + 'm') : m > 0 ? (m + 'm ' + s + 's') : (s + 's')

    await supabase.from('work_order_comments').insert({
      work_order_id: wo.id,
      user_id: profile?.id,
      comment: 'Time logged: ' + timeStr + ' by ' + (profile?.full_name ?? 'technician'),
      comment_type: 'time_log',
      organisation_id: profile?.organisation_id,
    })
    const currentHours = wo.actual_hours ?? 0
    await supabase.from('work_orders').update({
      actual_hours: parseFloat((currentHours + mins / 60).toFixed(2))
    }).eq('id', wo.id)
    setTimerSeconds(0)
    startTimeRef.current = null
    await fetchWO()
    Alert.alert('Time Logged', 'Logged ' + timeStr)
  }

  function formatTime(secs: number) {
    const h = Math.floor(secs / 3600)
    const m = Math.floor((secs % 3600) / 60)
    const s = secs % 60
    if (h > 0) return h + 'h ' + m + 'm'
    if (m > 0) return m + 'm ' + s + 's'
    return s + 's'
  }

  async function addComment() {
    if (!newComment.trim()) return
    setSaving(true)
    const { error } = await supabase.from('work_order_comments').insert({
      work_order_id: wo.id,
      user_id: profile?.id,
      comment: newComment.trim(),
      comment_type: 'comment',
      organisation_id: profile?.organisation_id,
    })
    if (error) console.log('Comment error:', JSON.stringify(error))
    setNewComment('')
    await fetchWO()
    setSaving(false)
  }

  async function pickPhoto(fromCamera: boolean) {
    if (fromCamera) {
      const perm = await ImagePicker.requestCameraPermissionsAsync()
      if (!perm.granted) { Alert.alert('Camera permission required'); return }
    } else {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!perm.granted) { Alert.alert('Gallery permission required'); return }
    }
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 })
    if (result.canceled) return
    setUploading(true)
    try {
      const uri = result.assets[0].uri
      const filename = 'wo-' + wo.id + '-' + Date.now() + '.jpg'
      const response = await fetch(uri)
      const blob = await response.blob()
      const arrayBuffer = await new Response(blob).arrayBuffer()
      const { error } = await supabase.storage.from('media').upload(filename, arrayBuffer, { contentType: 'image/jpeg', upsert: true })
      if (error) { Alert.alert('Upload error', error.message); setUploading(false); return }
      const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(filename)
      const currentPhotos = wo.photo_urls ?? []
      await supabase.from('work_orders').update({
        photo_urls: [...currentPhotos, publicUrl],
        updated_at: new Date().toISOString(),
      }).eq('id', wo.id)
      await fetchWO()
      Alert.alert('Done', 'Photo uploaded')
    } catch (e: any) {
      Alert.alert('Error', e.message)
    }
    setUploading(false)
  }

  if (loading) return <View style={styles.centered}><ActivityIndicator color={colors.primary} /></View>
  if (!wo) return <View style={styles.centered}><Text>Work order not found</Text></View>

  const pri = colors.priority[wo.priority as keyof typeof colors.priority] ?? colors.priority.medium
  const sts = colors.status[wo.status as keyof typeof colors.status] ?? colors.status.new

  const statusLabels: Record<string, string> = {
    new: t('new'), assigned: t('assigned'), in_progress: t('in_progress'),
    on_hold: t('on_hold'), completed: t('completed'), closed: t('closed'),
  }
  const priorityLabels: Record<string, string> = {
    critical: t('critical'), high: t('high'), medium: t('medium'), low: t('low'),
  }
  const statusActions: Record<string, { next: string; label: string; color: string }[]> = {
    new:         [{ next: 'in_progress', label: t('start_work'), color: colors.info }],
    assigned:    [{ next: 'in_progress', label: t('start_work'), color: colors.info }],
    in_progress: [{ next: 'completed', label: t('complete'), color: colors.success }, { next: 'on_hold', label: t('put_on_hold'), color: colors.warning }],
    on_hold:     [{ next: 'in_progress', label: t('start_work'), color: colors.info }],
    completed:   [{ next: 'in_progress', label: lang === 'ar' ? 'إعادة فتح' : 'Reopen', color: colors.warning }],
    closed:      [{ next: 'in_progress', label: lang === 'ar' ? 'إعادة فتح' : 'Reopen', color: colors.warning }],
  }
  const actions = statusActions[wo.status] ?? []
  const comments = allComments.filter(c => c.comment_type === 'comment' || c.comment_type === 'status_change' || !c.comment_type)
  const timeLogs = allComments.filter(c => c.comment_type === 'time_log')
  const photos = wo.photo_urls ?? []

  const tabs = [
    { key: 'details',  label: lang === 'ar' ? 'التفاصيل' : 'Details' },
    { key: 'comments', label: lang === 'ar' ? 'التعليقات' : 'Comments', count: comments.length },
    { key: 'photos',   label: lang === 'ar' ? 'الصور' : 'Photos', count: photos.length },
    { key: 'time',     label: lang === 'ar' ? 'الوقت' : 'Time', count: timeLogs.length },
  ]

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={styles.titleCard}>
        <View style={styles.badgeRow}>
          <View style={[styles.badge, { backgroundColor: pri.bg }]}>
            <Text style={[styles.badgeText, { color: pri.text }]}>{priorityLabels[wo.priority] ?? wo.priority}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: sts.bg }]}>
            <Text style={[styles.badgeText, { color: sts.text }]}>{statusLabels[wo.status] ?? wo.status}</Text>
          </View>
        </View>
        <Text style={styles.woTitle}>{wo.title}</Text>
      </View>

      {actions.length > 0 && (
        <View style={styles.actionsRow}>
          {actions.map(action => (
            <TouchableOpacity key={action.next} style={[styles.actionBtn, { backgroundColor: action.color }]}
              onPress={() => updateStatus(action.next)} disabled={saving}>
              {saving
                ? <ActivityIndicator color='white' size='small' />
                : <Text style={styles.actionBtnText}>{action.label}</Text>
              }
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={styles.tabRow}>
        {tabs.map(tab => (
          <TouchableOpacity key={tab.key} style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key as any)}>
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
              {tab.label}
              {tab.count !== undefined && tab.count > 0 ? ' (' + tab.count + ')' : ''}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={{ flex: 1 }}>
        {activeTab === 'details' && (
          <View style={styles.card}>
            {[
              { label: t('asset'),       value: wo.asset?.name },
              { label: t('site'),        value: wo.site?.name },
              { label: t('assigned_to'), value: wo.assignee?.full_name ?? t('unassigned') },
              { label: t('due_date'),    value: wo.due_at ? format(new Date(wo.due_at), 'dd MMM yyyy') : null },
              { label: lang === 'ar' ? 'بدأ في' : 'Started', value: wo.started_at ? format(new Date(wo.started_at), 'dd MMM HH:mm') : null },
              { label: lang === 'ar' ? 'اكتمل في' : 'Completed', value: wo.completed_at ? format(new Date(wo.completed_at), 'dd MMM HH:mm') : null },
              { label: lang === 'ar' ? 'ساعات العمل' : 'Hours Worked', value: wo.actual_hours ? wo.actual_hours + ' hrs' : null },
            ].filter(r => r.value).map(row => (
              <View key={row.label} style={styles.row}>
                <Text style={styles.rowLabel}>{row.label}</Text>
                <Text style={styles.rowValue}>{row.value}</Text>
              </View>
            ))}
            {wo.description ? (
              <View style={{ marginTop: 12 }}>
                <Text style={styles.rowLabel}>{t('description')}</Text>
                <Text style={{ fontSize: 14, color: colors.text, marginTop: 6, lineHeight: 20 }}>{wo.description}</Text>
              </View>
            ) : null}
          </View>
        )}

        {activeTab === 'comments' && (
          <View style={styles.card}>
            {comments.length === 0
              ? <Text style={styles.empty}>{lang === 'ar' ? 'لا توجد تعليقات بعد' : 'No comments yet'}</Text>
              : comments.map(c => (
                <View key={c.id} style={[styles.comment, c.comment_type === 'status_change' ? styles.commentSystem : null]}>
                  {c.comment_type !== 'status_change' && (
                    <View style={styles.commentAvatar}>
                      <Text style={styles.commentAvatarText}>{c.author?.full_name?.[0] ?? 'U'}</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    {c.comment_type !== 'status_change' && (
                      <Text style={styles.commentAuthor}>{c.author?.full_name ?? 'User'}</Text>
                    )}
                    <Text style={c.comment_type === 'status_change' ? styles.commentSystemText : styles.commentText}>
                      {c.comment_type === 'status_change' ? '🔄 ' + c.comment : c.comment}
                    </Text>
                    <Text style={styles.commentTime}>{format(new Date(c.created_at), 'dd MMM, HH:mm')}</Text>
                  </View>
                </View>
              ))
            }
            <View style={styles.commentInput}>
              <TextInput
                style={styles.commentTextInput}
                value={newComment}
                onChangeText={setNewComment}
                placeholder={lang === 'ar' ? 'أضف تعليقاً...' : 'Add a comment...'}
                placeholderTextColor={colors.textLight}
                multiline
              />
              <TouchableOpacity style={styles.sendBtn} onPress={addComment} disabled={saving}>
                <Ionicons name='send' size={18} color='white' />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {activeTab === 'photos' && (
          <View style={styles.card}>
            <View style={styles.photoActions}>
              <TouchableOpacity style={styles.photoBtn} onPress={() => pickPhoto(true)} disabled={uploading}>
                <Ionicons name='camera-outline' size={18} color={colors.primary} />
                <Text style={styles.photoBtnText}>{lang === 'ar' ? 'كاميرا' : 'Camera'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.photoBtn} onPress={() => pickPhoto(false)} disabled={uploading}>
                <Ionicons name='images-outline' size={18} color={colors.primary} />
                <Text style={styles.photoBtnText}>{lang === 'ar' ? 'المعرض' : 'Gallery'}</Text>
              </TouchableOpacity>
            </View>
            {uploading && <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} />}
            {photos.length === 0
              ? <Text style={styles.empty}>{lang === 'ar' ? 'لا توجد صور بعد' : 'No photos yet'}</Text>
              : (
                <View style={styles.photoGrid}>
                  {photos.map((url: string, i: number) => (
                    <Image key={i} source={{ uri: url }} style={styles.photo} />
                  ))}
                </View>
              )
            }
          </View>
        )}

        {activeTab === 'time' && (
          <View style={styles.card}>
            <View style={styles.timerBox}>
              <Text style={styles.timerDisplay}>{formatTime(timerSeconds)}</Text>
              <Text style={styles.timerLabel}>
                {timerRunning ? (lang === 'ar' ? 'جاري التسجيل...' : 'Recording...') : (lang === 'ar' ? 'مؤقت الوقت' : 'Time Tracker')}
              </Text>
              {!timerRunning
                ? (
                  <TouchableOpacity style={[styles.timerBtn, { backgroundColor: colors.success }]} onPress={startTimer}>
                    <Ionicons name='play' size={20} color='white' />
                    <Text style={styles.timerBtnText}>{lang === 'ar' ? 'ابدأ' : 'Start'}</Text>
                  </TouchableOpacity>
                )
                : (
                  <TouchableOpacity style={[styles.timerBtn, { backgroundColor: colors.error }]} onPress={stopTimer}>
                    <Ionicons name='stop' size={20} color='white' />
                    <Text style={styles.timerBtnText}>{lang === 'ar' ? 'أوقف وسجل' : 'Stop & Log'}</Text>
                  </TouchableOpacity>
                )
              }
            </View>
            {wo.actual_hours ? (
              <View style={[styles.row, { backgroundColor: colors.infoLight, borderRadius: 8, padding: 10, marginBottom: 12 }]}>
                <Text style={styles.rowLabel}>{lang === 'ar' ? 'إجمالي ساعات العمل' : 'Total Hours'}</Text>
                <Text style={[styles.rowValue, { color: colors.info, fontWeight: '700' }]}>{wo.actual_hours + ' hrs'}</Text>
              </View>
            ) : null}
            <Text style={[styles.rowLabel, { marginBottom: 10 }]}>{lang === 'ar' ? 'سجل الوقت' : 'Time Log'}</Text>
            {timeLogs.length === 0
              ? <Text style={styles.empty}>{lang === 'ar' ? 'لا توجد سجلات وقت' : 'No time logs yet'}</Text>
              : timeLogs.map(log => (
                <View key={log.id} style={styles.timeLog}>
                  <Ionicons name='time-outline' size={16} color={colors.info} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.timeLogText}>{log.comment}</Text>
                    <Text style={styles.commentTime}>{format(new Date(log.created_at), 'dd MMM yyyy, HH:mm')}</Text>
                  </View>
                </View>
              ))
            }
          </View>
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  titleCard: { backgroundColor: 'white', padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  badgeRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  badgeText: { fontSize: 11, fontWeight: '600' },
  woTitle: { fontSize: 17, fontWeight: '600', color: colors.text, lineHeight: 24 },
  actionsRow: { flexDirection: 'row', gap: 10, padding: 12, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: colors.border },
  actionBtn: { flex: 1, padding: 12, borderRadius: radius.sm, alignItems: 'center' },
  actionBtnText: { color: 'white', fontSize: 14, fontWeight: '600' },
  tabRow: { flexDirection: 'row', backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: colors.border },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: colors.primary },
  tabText: { fontSize: 11, color: colors.textSecondary },
  tabTextActive: { color: colors.primary, fontWeight: '600' },
  card: { margin: 16, backgroundColor: 'white', borderRadius: radius.md, padding: 16, ...shadow.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowLabel: { fontSize: 13, color: colors.textSecondary },
  rowValue: { fontSize: 13, fontWeight: '500', color: colors.text, maxWidth: '60%', textAlign: 'right' },
  comment: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  commentSystem: { backgroundColor: colors.background, borderRadius: 8, padding: 8, marginBottom: 8 },
  commentSystemText: { fontSize: 12, color: colors.textSecondary },
  commentAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  commentAvatarText: { color: 'white', fontWeight: '600', fontSize: 13 },
  commentAuthor: { fontSize: 12, fontWeight: '600', color: colors.text, marginBottom: 2 },
  commentText: { fontSize: 14, color: colors.text, lineHeight: 20 },
  commentTime: { fontSize: 11, color: colors.textLight, marginTop: 3 },
  commentInput: { flexDirection: 'row', gap: 10, alignItems: 'flex-end', marginTop: 12 },
  commentTextInput: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: 10, fontSize: 14, color: colors.text, maxHeight: 100 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  empty: { textAlign: 'center', color: colors.textLight, fontSize: 13, paddingVertical: 24 },
  photoActions: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  photoBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.infoLight },
  photoBtnText: { fontSize: 13, color: colors.primary, fontWeight: '500' },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photo: { width: 100, height: 100, borderRadius: radius.sm },
  timerBox: { alignItems: 'center', paddingVertical: 24, marginBottom: 16 },
  timerDisplay: { fontSize: 48, fontWeight: '700', color: colors.primary },
  timerLabel: { fontSize: 13, color: colors.textSecondary, marginTop: 4, marginBottom: 16 },
  timerBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 24, paddingVertical: 12, borderRadius: radius.md },
  timerBtnText: { color: 'white', fontSize: 15, fontWeight: '600' },
  timeLog: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  timeLogText: { fontSize: 13, color: colors.text },
})"""

with open('src/screens/WorkOrderDetailScreen.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('WorkOrderDetailScreen completely rewritten cleanly')