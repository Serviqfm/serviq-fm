import React, { useEffect, useState, useRef } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Image } from 'expo-image'
import { useRoute, useNavigation } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import * as ImageManipulator from 'expo-image-manipulator'
import { supabase } from '../lib/supabase'
import { cacheGet, cacheSet, enqueue, isOnline } from '../lib/offline'
import { closeWorkOrder } from '../lib/webApi'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LangContext'
import { colors, radius, shadow } from '../lib/theme'
import { format } from 'date-fns'
import { Modal, Dimensions } from 'react-native'

function useCountdown(dueAt: string | null) {
  const [timeLeft, setTimeLeft] = useState<string | null>(null)
  const [isUrgent, setIsUrgent] = useState(false)

  useEffect(() => {
    if (!dueAt) return
    function tick() {
      const parsed = new Date(dueAt!)
      if (isNaN(parsed.getTime())) return
      const diff = parsed.getTime() - Date.now()
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
        setTimeLeft(null)
      }
    }
    tick()
    const id = setInterval(tick, 60000)
    return () => clearInterval(id)
  }, [dueAt])

  return { timeLeft, isUrgent }
}

function CountdownBanner({ dueAt }: { dueAt: string | null }) {
  const { t } = useLang()
  const { timeLeft } = useCountdown(dueAt)
  if (!timeLeft) return null
  if (timeLeft === 'Overdue') {
    return (
      <View style={{ backgroundColor: '#FEE2E2', padding: 12, marginHorizontal: 16, borderRadius: 10, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name="alert-circle-outline" size={18} color="#C62828" />
        <Text style={{ color: '#C62828', fontWeight: '600', fontSize: 14 }}>{t('overdue')}</Text>
      </View>
    )
  }
  return (
    <View style={{ backgroundColor: '#FEF3C7', padding: 12, marginHorizontal: 16, borderRadius: 10, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Ionicons name="warning-outline" size={18} color="#92400E" />
      <Text style={{ color: '#92400E', fontWeight: '600', fontSize: 14 }}>{t('due_in', { time: timeLeft })}</Text>
    </View>
  )
}

export default function WorkOrderDetailScreen() {
  const route = useRoute<any>()
  const navigation = useNavigation<any>()
  const insets = useSafeAreaInsets()
  const { profile } = useAuth()
  const { t, lang } = useLang()
  const [wo, setWo] = useState<any>(null)
  const [allComments, setAllComments] = useState<any[]>([])
  const [tasks, setTasks] = useState<any[]>([]) // FM-06/WO-21: WO checklist tasks
  const [newTask, setNewTask] = useState('')
  const [newComment, setNewComment] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [zoomPhoto, setZoomPhoto] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'details' | 'tasks' | 'comments' | 'photos' | 'time' | 'activity'>('details')
  const [timerRunning, setTimerRunning] = useState(false)
  const [timerSeconds, setTimerSeconds] = useState(0)
  // CORE-05 / FM-07: completion (close-out) flow routed through the web close endpoint.
  const [closeModal, setCloseModal] = useState<null | 'completed' | 'closed'>(null)
  const [closeoutPhotos, setCloseoutPhotos] = useState<string[]>([])
  const [signoff, setSignoff] = useState('')
  const [completionNotes, setCompletionNotes] = useState('')
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
      .select('id, body, comment_type, created_at, author:user_id(full_name)')
      .eq('work_order_id', route.params.id)
      .order('created_at', { ascending: true })
    if (cmtError) console.log('CMT Error:', JSON.stringify(cmtError))
    if (cmts) setAllComments(cmts)

    // FM-06/WO-21: work-order checklist tasks (org-scoped RLS).
    const { data: tsk, error: tskError } = await supabase
      .from('work_order_tasks')
      .select('id, title, title_ar, is_done, done_at, done_by, sort_order, done_by_user:done_by(full_name)')
      .eq('work_order_id', route.params.id)
      .order('sort_order', { ascending: true })
    if (tskError) console.log('TASK Error:', JSON.stringify(tskError))
    if (tsk) setTasks(tsk)

    // CORE-07: cache the detail bundle on success; serve it when offline.
    if (data) {
      cacheSet(`wo:${route.params.id}`, { wo: data, comments: cmts ?? [], tasks: tsk ?? [] })
    } else {
      const cached = await cacheGet<{ wo: any; comments: any[]; tasks: any[] }>(`wo:${route.params.id}`)
      if (cached) {
        setWo(cached.wo)
        setAllComments(cached.comments)
        setTasks(cached.tasks)
      }
    }

    setLoading(false)
  }

  // Persist an optimistic offline change into the detail cache so it survives
  // an app restart while still disconnected.
  function cacheOffline(nextWo: any, nextComments: any[]) {
    cacheSet(`wo:${route.params.id}`, { wo: nextWo, comments: nextComments, tasks })
  }

  // FM-06/WO-21: toggle a checklist item, recording done_by/done_at. Optimistic
  // update, then persist; matches the web WO detail tasks handler.
  async function toggleTask(task: any) {
    const nowDone = !task.is_done
    setTasks(prev => prev.map(t2 => t2.id === task.id ? { ...t2, is_done: nowDone } : t2))
    const { error } = await supabase.from('work_order_tasks').update({
      is_done: nowDone,
      done_by: nowDone ? profile?.id ?? null : null,
      done_at: nowDone ? new Date().toISOString() : null,
    }).eq('id', task.id)
    if (error) { Alert.alert(t('error'), error.message); await fetchWO(); return }
    await fetchWO()
  }

  async function addTask() {
    if (!newTask.trim() || !profile?.organisation_id) return
    setSaving(true)
    const { error } = await supabase.from('work_order_tasks').insert({
      organisation_id: profile.organisation_id,
      work_order_id: wo.id,
      title: newTask.trim(),
      sort_order: tasks.length,
    })
    if (error) console.log('Add task error:', JSON.stringify(error))
    setNewTask('')
    await fetchWO()
    setSaving(false)
  }

  async function updateStatus(newStatus: string) {
    // CORE-05 / FM-07: completing or closing must go through the web close
    // endpoint (field-config close-out photos, sign-off, audit, manager
    // notification). Open the completion screen instead of writing directly.
    if (newStatus === 'completed' || newStatus === 'closed') {
      // CORE-07: close-out goes through the web endpoint (multipart photos,
      // server-side validation) — not queueable offline in this first cut.
      if (!isOnline()) {
        Alert.alert(t('offline'), t('offline_complete_blocked'))
        return
      }
      // FM-06/WO-21: warn if checklist tasks are still open before completing.
      const openTasks = tasks.filter(t2 => !t2.is_done).length
      const openCloseout = () => {
        setCloseoutPhotos([])
        setSignoff(profile?.full_name ?? '')
        setCompletionNotes('')
        setCloseModal(newStatus)
      }
      if (openTasks > 0) {
        Alert.alert(
          lang === 'ar' ? 'مهام غير مكتملة' : 'Open tasks',
          lang === 'ar'
            ? `${openTasks} من المهام لم تكتمل بعد. المتابعة على أي حال؟`
            : `${openTasks} checklist task(s) are still open. Continue anyway?`,
          [
            { text: t('cancel'), style: 'cancel' },
            { text: lang === 'ar' ? 'متابعة' : 'Continue', onPress: openCloseout },
          ]
        )
        return
      }
      openCloseout()
      return
    }
    setSaving(true)
    const now = new Date().toISOString()
    const updates: any = { status: newStatus, updated_at: now }
    if (newStatus === 'in_progress' && !wo.started_at) updates.started_at = now
    if (wo.completed_at) updates.completed_at = null // reopening clears stale completion time
    if (wo.closed_at) updates.closed_at = null // reopening a closed WO clears the stale close time
    const body = t('status_changed_to', { status: t(newStatus) })
    // CORE-07: offline — queue the mutation, apply it locally, replay on reconnect.
    if (!isOnline()) {
      await enqueue({ kind: 'wo_status', woId: wo.id, updates, body, userId: profile?.id ?? null })
      const nextWo = { ...wo, ...updates }
      const nextComments = [...allComments, {
        id: 'queued-' + Date.now(), body, comment_type: 'status_change',
        created_at: now, author: { full_name: profile?.full_name },
      }]
      setWo(nextWo)
      setAllComments(nextComments)
      cacheOffline(nextWo, nextComments)
      setSaving(false)
      Alert.alert(t('offline'), t('offline_queued'))
      return
    }
    await supabase.from('work_orders').update(updates).eq('id', wo.id)
    await supabase.from('work_order_comments').insert({
      work_order_id: wo.id,
      user_id: profile?.id,
      body,
      comment_type: 'status_change',
    })
    setWo((prev: any) => ({ ...prev, ...updates }))
    await fetchWO()
    setSaving(false)
  }

  // Route the close-out through the web server endpoint. Server enforces
  // required close-out photos and returns a clear message when missing.
  async function submitClose() {
    if (!closeModal) return
    // CORE-07: connection may have dropped while the sheet was open.
    if (!isOnline()) {
      Alert.alert(t('offline'), t('offline_complete_blocked'))
      return
    }
    setSaving(true)
    const result = await closeWorkOrder({
      workOrderId: wo.id,
      status: closeModal,
      closeoutPhotoUrls: closeoutPhotos,
      signoff: signoff.trim() || undefined,
      completionNotes: completionNotes.trim() || undefined,
    })
    setSaving(false)
    if (!result.ok) {
      Alert.alert(t('error'), t('complete_failed', { error: result.error }))
      return
    }
    const doneKey = closeModal === 'closed' ? 'closed_ok' : 'completed_ok'
    setCloseModal(null)
    await fetchWO()
    Alert.alert(lang === 'ar' ? 'تم' : 'Done', t(doneKey))
  }

  // Compress + upload a single image, return its public URL. Shared by the
  // Photos tab and the close-out photo capture.
  async function uploadImageToStorage(originalUri: string): Promise<string> {
    const compressed = await ImageManipulator.manipulateAsync(
      originalUri,
      [{ resize: { width: 800 } }],
      { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG }
    )
    const filename = 'wo-' + wo.id + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10) + '.jpg'
    const response = await fetch(compressed.uri)
    const blob = await response.blob()
    const arrayBuffer = await new Response(blob).arrayBuffer()
    const { error } = await supabase.storage.from('media').upload(filename, arrayBuffer, { contentType: 'image/jpeg', upsert: false })
    if (error) throw new Error(error.message)
    const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(filename)
    return publicUrl
  }

  // Capture a close-out photo for the completion screen (not yet attached to
  // the WO — the server merges these into photo_urls on close).
  async function addCloseoutPhoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync()
    if (!perm.granted) { Alert.alert(t('camera_permission_required')); return }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.3, allowsEditing: true, aspect: [4, 3] as [number, number] })
    if (result.canceled) return
    setUploading(true)
    try {
      const url = await uploadImageToStorage(result.assets[0].uri)
      setCloseoutPhotos(prev => [...prev, url])
    } catch (e: any) {
      Alert.alert(t('error'), e.message)
    }
    setUploading(false)
  }

  function startTimer() {
    startTimeRef.current = new Date()
    setTimerSeconds(0)
    setTimerRunning(true)
    // Display ticks are derived from wall clock so the timer stays correct
    // even when JS timers are paused (app backgrounded / screen locked).
    timerRef.current = setInterval(() => {
      if (startTimeRef.current) {
        setTimerSeconds(Math.floor((Date.now() - startTimeRef.current.getTime()) / 1000))
      }
    }, 1000)
  }

  async function stopTimer() {
    if (!timerRef.current || !startTimeRef.current) return
    clearInterval(timerRef.current)
    timerRef.current = null
    setTimerRunning(false)
    // Log the real elapsed wall-clock time, not the interval tick count.
    const secs = Math.max(0, Math.floor((Date.now() - startTimeRef.current.getTime()) / 1000))
    const mins = Math.round(secs / 60)
    const h = Math.floor(secs / 3600)
    const m = Math.floor((secs % 3600) / 60)
    const s = secs % 60
    const timeStr = h > 0 ? (h + 'h ' + m + 'm') : m > 0 ? (m + 'm ' + s + 's') : (s + 's')
    const body = t('time_logged_by', { time: timeStr, name: profile?.full_name ?? t('technician') })

    // CORE-07: offline — queue the time log (hours are added read-modify-write
    // at replay time so concurrent web edits are not clobbered).
    if (!isOnline()) {
      await enqueue({
        kind: 'time_log', woId: wo.id, body,
        addHours: parseFloat((mins / 60).toFixed(2)), userId: profile?.id ?? null,
      })
      const nextComments = [...allComments, {
        id: 'queued-' + Date.now(), body, comment_type: 'time_log',
        created_at: new Date().toISOString(), author: { full_name: profile?.full_name },
      }]
      setAllComments(nextComments)
      cacheOffline(wo, nextComments)
      setTimerSeconds(0)
      startTimeRef.current = null
      Alert.alert(t('time_logged'), t('offline_queued'))
      return
    }

    await supabase.from('work_order_comments').insert({
      work_order_id: wo.id,
      user_id: profile?.id,
      body,
      comment_type: 'time_log',
    })
    const currentHours = wo.actual_hours ?? 0
    await supabase.from('work_orders').update({
      actual_hours: parseFloat((currentHours + mins / 60).toFixed(2))
    }).eq('id', wo.id)
    setTimerSeconds(0)
    startTimeRef.current = null
    await fetchWO()
    Alert.alert(t('time_logged'), t('time_logged_msg', { time: timeStr }))
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
    // CORE-07: offline — queue the comment and show it locally.
    if (!isOnline()) {
      const body = newComment.trim()
      await enqueue({ kind: 'comment', woId: wo.id, body, userId: profile?.id ?? null })
      const nextComments = [...allComments, {
        id: 'queued-' + Date.now(), body, comment_type: 'comment',
        created_at: new Date().toISOString(), author: { full_name: profile?.full_name },
      }]
      setAllComments(nextComments)
      cacheOffline(wo, nextComments)
      setNewComment('')
      return
    }
    setSaving(true)
    const { error } = await supabase.from('work_order_comments').insert({
      work_order_id: wo.id,
      user_id: profile?.id,
      body: newComment.trim(),
      comment_type: 'comment',
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
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.3, allowsEditing: true, aspect: [4, 3] as [number, number] })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.4, allowsEditing: false })
    if (result.canceled) return
    setUploading(true)
    try {
      const publicUrl = await uploadImageToStorage(result.assets[0].uri)
      // Re-fetch the latest photo list right before writing to shrink the
      // read-modify-write window against concurrent uploads.
      const { data: fresh } = await supabase.from('work_orders').select('photo_urls').eq('id', wo.id).single()
      const currentPhotos = fresh?.photo_urls ?? wo.photo_urls ?? []
      await supabase.from('work_orders').update({
        photo_urls: [...currentPhotos, publicUrl],
        updated_at: new Date().toISOString(),
      }).eq('id', wo.id)
      // Verify our URL survived any concurrent update; retry once if it was lost.
      const { data: check } = await supabase.from('work_orders').select('photo_urls').eq('id', wo.id).single()
      const latest: string[] = check?.photo_urls ?? []
      if (check && !latest.includes(publicUrl)) {
        await supabase.from('work_orders').update({
          photo_urls: [...latest, publicUrl],
          updated_at: new Date().toISOString(),
        }).eq('id', wo.id)
      }
      await fetchWO()
      Alert.alert(lang === 'ar' ? 'تم' : 'Done', lang === 'ar' ? 'تم رفع الصورة' : 'Photo uploaded')
    } catch (e: any) {
      Alert.alert('Error', e.message)
    }
    setUploading(false)
  }

  if (loading) return <View style={styles.centered}><ActivityIndicator color={colors.primary} /></View>
  if (!wo) return <View style={styles.centered}><Text>{t('wo_not_found')}</Text></View>

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
  // DV-25 / CORE-20: requesters get no status actions (read-only); reopening a
  // completed/closed WO is manager/admin only.
  const role = profile?.role
  const isManager = role === 'admin' || role === 'manager'
  const actions = role === 'requester'
    ? []
    : (statusActions[wo.status] ?? []).filter(a => {
        const isReopen = (wo.status === 'completed' || wo.status === 'closed') && a.next === 'in_progress'
        return isReopen ? isManager : true
      })
  const comments = allComments.filter(c => c.comment_type === 'comment' || c.comment_type === 'status_change' || !c.comment_type)
  const timeLogs = allComments.filter(c => c.comment_type === 'time_log')
  const photos = wo.photo_urls ?? []

  const doneTasks = tasks.filter(t2 => t2.is_done).length
  const tabs = [
    { key: 'details',  label: lang === 'ar' ? 'التفاصيل' : 'Details' },
    { key: 'tasks',    label: (lang === 'ar' ? 'المهام' : 'Tasks') + (tasks.length ? ` (${doneTasks}/${tasks.length})` : '') },
    { key: 'comments', label: lang === 'ar' ? 'التعليقات' : 'Comments', count: comments.length },
    { key: 'photos',   label: lang === 'ar' ? 'الصور' : 'Photos', count: photos.length },
    { key: 'time',     label: lang === 'ar' ? 'الوقت' : 'Time', count: timeLogs.length },
    { key: 'activity', label: lang === 'ar' ? 'النشاط' : 'Activity', count: allComments.length },
  ]

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 44 : 0}>
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

      <CountdownBanner dueAt={wo.due_at ?? null} />

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

        {activeTab === 'tasks' && (
          <View style={styles.card}>
            {tasks.length > 0 && (
              <View style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={styles.rowLabel}>
                    {lang === 'ar' ? `${doneTasks}/${tasks.length} مكتمل` : `${doneTasks}/${tasks.length} completed`}
                  </Text>
                  <Text style={[styles.rowLabel, { fontWeight: '700', color: colors.primary }]}>
                    {Math.round((doneTasks / tasks.length) * 100)}%
                  </Text>
                </View>
                <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' }}>
                  <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.primary, width: `${(doneTasks / tasks.length) * 100}%` }} />
                </View>
              </View>
            )}
            {tasks.length === 0
              ? <Text style={styles.empty}>{lang === 'ar' ? 'لا توجد مهام' : 'No tasks yet'}</Text>
              : tasks.map(task => (
                <TouchableOpacity key={task.id} style={styles.taskRow} onPress={() => toggleTask(task)} activeOpacity={0.6}>
                  <Ionicons
                    name={task.is_done ? 'checkbox' : 'square-outline'}
                    size={22}
                    color={task.is_done ? colors.success : colors.textLight}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.taskText, task.is_done && { textDecorationLine: 'line-through', color: colors.textLight }]}>
                      {lang === 'ar' && task.title_ar ? task.title_ar : task.title}
                    </Text>
                    {task.is_done && task.done_at ? (
                      <Text style={styles.commentTime}>
                        {(task.done_by_user?.full_name ?? '—') + ' · ' + format(new Date(task.done_at), 'dd MMM, HH:mm')}
                      </Text>
                    ) : null}
                  </View>
                </TouchableOpacity>
              ))
            }
            {role !== 'requester' && (
              <View style={styles.commentInput}>
                <TextInput
                  style={styles.commentTextInput}
                  value={newTask}
                  onChangeText={setNewTask}
                  placeholder={lang === 'ar' ? 'أضف مهمة...' : 'Add a task...'}
                  placeholderTextColor={colors.textLight}
                  onSubmitEditing={addTask}
                  returnKeyType='done'
                />
                <TouchableOpacity style={styles.sendBtn} onPress={addTask} disabled={saving}>
                  <Ionicons name='add' size={22} color='white' />
                </TouchableOpacity>
              </View>
            )}
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
                      {c.comment_type === 'status_change' ? '🔄 ' + c.body : c.body}
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
                    <TouchableOpacity key={i} onPress={() => setZoomPhoto(url)}>
                      <Image source={{ uri: url }} style={styles.photo} contentFit='cover' transition={200} placeholder='LGF5?xYk^6#M@-5c,1J5@[or[Q6.' />
                    </TouchableOpacity>
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
                    <Text style={styles.timeLogText}>{log.body}</Text>
                    <Text style={styles.commentTime}>{format(new Date(log.created_at), 'dd MMM yyyy, HH:mm')}</Text>
                  </View>
                </View>
              ))
            }
          </View>
        )}

        {activeTab === 'activity' && (
          <View style={styles.card}>
            <Text style={[styles.rowLabel, { marginBottom: 12 }]}>
              {lang === 'ar' ? 'سجل النشاط الكامل' : 'Full Activity Log'}
            </Text>
            {allComments.length === 0
              ? <Text style={styles.empty}>{lang === 'ar' ? 'لا يوجد نشاط بعد' : 'No activity yet'}</Text>
              : [...allComments].reverse().map(c => {
                const isStatus = c.comment_type === 'status_change'
                const isTime = c.comment_type === 'time_log'
                const isComment = !c.comment_type || c.comment_type === 'comment'
                const icon = isStatus ? 'swap-horizontal-outline' : isTime ? 'time-outline' : 'chatbubble-outline'
                const iconColor = isStatus ? colors.warning : isTime ? colors.info : colors.primary
                return (
                  <View key={c.id} style={styles.activityRow}>
                    <View style={[styles.activityIcon, { backgroundColor: iconColor + '20' }]}>
                      <Ionicons name={icon as any} size={14} color={iconColor} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.activityText}>{c.body}</Text>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
                        <Text style={styles.commentTime}>{c.author?.full_name ?? 'System'}</Text>
                        <Text style={styles.commentTime}>{format(new Date(c.created_at), 'dd MMM HH:mm')}</Text>
                      </View>
                    </View>
                  </View>
                )
              })
            }
          </View>
        )}

      </ScrollView>

      {zoomPhoto && (
        <Modal transparent animationType='fade' onRequestClose={() => setZoomPhoto(null)}>
          <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', alignItems: 'center', justifyContent: 'center' }}
            onPress={() => setZoomPhoto(null)}>
            <Image source={{ uri: zoomPhoto }} style={{ width: Dimensions.get('window').width, height: Dimensions.get('window').width }} contentFit='contain' transition={200} />
            <Text style={{ color: 'white', marginTop: 16, fontSize: 13 }}>{lang === 'ar' ? 'اضغط للإغلاق' : 'Tap to close'}</Text>
          </TouchableOpacity>
        </Modal>
      )}

      {closeModal && (
        <Modal transparent animationType='slide' onRequestClose={() => !saving && setCloseModal(null)}>
          <KeyboardAvoidingView
            style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.sheet}>
              <View style={styles.sheetHandle} />
              <Text style={styles.sheetTitle}>
                {closeModal === 'closed' ? t('close_wo') : t('complete_wo')}
              </Text>
              <ScrollView style={{ maxHeight: Dimensions.get('window').height * 0.6 }}>
                <Text style={styles.fieldLabel}>{t('closeout_photo')}</Text>
                {closeoutPhotos.length > 0 && (
                  <View style={styles.photoGrid}>
                    {closeoutPhotos.map((url, i) => (
                      <Image key={i} source={{ uri: url }} style={styles.photo} contentFit='cover' transition={200} />
                    ))}
                  </View>
                )}
                <TouchableOpacity style={styles.sheetPhotoBtn} onPress={addCloseoutPhoto} disabled={uploading || saving}>
                  {uploading
                    ? <ActivityIndicator color={colors.primary} />
                    : (<><Ionicons name='camera-outline' size={18} color={colors.primary} /><Text style={styles.photoBtnText}>{t('add_photo')}</Text></>)}
                </TouchableOpacity>

                <Text style={[styles.fieldLabel, { marginTop: 16 }]}>{t('signoff_name')}</Text>
                <TextInput
                  style={styles.sheetInput}
                  value={signoff}
                  onChangeText={setSignoff}
                  placeholder={t('signoff_placeholder')}
                  placeholderTextColor={colors.textLight}
                />

                <Text style={[styles.fieldLabel, { marginTop: 16 }]}>{t('completion_notes')}</Text>
                <TextInput
                  style={[styles.sheetInput, { minHeight: 72, textAlignVertical: 'top' }]}
                  value={completionNotes}
                  onChangeText={setCompletionNotes}
                  placeholder={t('completion_notes_placeholder')}
                  placeholderTextColor={colors.textLight}
                  multiline
                />
              </ScrollView>

              <View style={styles.sheetActions}>
                <TouchableOpacity style={[styles.sheetBtn, styles.sheetBtnGhost]} onPress={() => setCloseModal(null)} disabled={saving}>
                  <Text style={styles.sheetBtnGhostText}>{t('cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.sheetBtn, { backgroundColor: colors.success }]} onPress={submitClose} disabled={saving || uploading}>
                  {saving
                    ? <ActivityIndicator color='white' size='small' />
                    : <Text style={styles.sheetBtnText}>{t('submit')}</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      )}
    </KeyboardAvoidingView>
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
  taskRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  taskText: { fontSize: 14, color: colors.text, lineHeight: 20 },
  photoActions: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  photoBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.infoLight },
  photoBtnText: { fontSize: 13, color: colors.primary, fontWeight: '500' },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photo: { width: 100, height: 100, borderRadius: radius.sm, backgroundColor: colors.border },
  timerBox: { alignItems: 'center', paddingVertical: 24, marginBottom: 16 },
  timerDisplay: { fontSize: 48, fontWeight: '700', color: colors.primary },
  timerLabel: { fontSize: 13, color: colors.textSecondary, marginTop: 4, marginBottom: 16 },
  timerBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 24, paddingVertical: 12, borderRadius: radius.md },
  timerBtnText: { color: 'white', fontSize: 15, fontWeight: '600' },
  timeLog: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  timeLogText: { fontSize: 13, color: colors.text },
  activityRow: { flexDirection: 'row', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border, alignItems: 'flex-start' },
  activityIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  activityText: { fontSize: 13, color: colors.text, lineHeight: 18 },
  sheet: { backgroundColor: 'white', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32 },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: 12 },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: 16 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: 8 },
  sheetInput: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: 12, fontSize: 14, color: colors.text },
  sheetActions: { flexDirection: 'row', gap: 12, marginTop: 20 },
  sheetBtn: { flex: 1, padding: 14, borderRadius: radius.sm, alignItems: 'center' },
  sheetBtnGhost: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  sheetBtnGhostText: { color: colors.textSecondary, fontSize: 15, fontWeight: '600' },
  sheetBtnText: { color: 'white', fontSize: 15, fontWeight: '600' },
  sheetPhotoBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.infoLight },
})