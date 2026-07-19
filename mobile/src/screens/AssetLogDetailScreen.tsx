import React, { useEffect, useState } from 'react'
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator,
  TouchableOpacity, TextInput, Alert, Modal, KeyboardAvoidingView, Platform,
} from 'react-native'
import { Image } from 'expo-image'
import { useRoute } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import * as ImageManipulator from 'expo-image-manipulator'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LangContext'
import { colors, radius, shadow } from '../lib/theme'
import { format } from 'date-fns'
import SelectField from '../components/SelectField'

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

  // Move / condition pickers
  const [sites, setSites] = useState<any[]>([])
  const [spaces, setSpaces] = useState<any[]>([])

  const [moveOpen, setMoveOpen] = useState(false)
  const [moveSiteId, setMoveSiteId] = useState<string | null>(null)
  const [moveSpaceId, setMoveSpaceId] = useState<string | null>(null)
  const [moveNote, setMoveNote] = useState('')
  const [moving, setMoving] = useState(false)

  const [condOpen, setCondOpen] = useState(false)
  const [rating, setRating] = useState(3)
  const [usable, setUsable] = useState(true)
  const [condNotes, setCondNotes] = useState('')
  const [condPhoto, setCondPhoto] = useState<string | null>(null)
  const [savingCond, setSavingCond] = useState(false)

  const canEdit = profile?.role !== 'requester'
  const itemId = route.params?.id

  async function load() {
    if (!profile?.organisation_id) return
    // Org-scoped read (defense-in-depth on top of RLS).
    const { data } = await supabase
      .from('asset_log_items')
      .select('*, type:type_id(name, name_ar), site:site_id(name), space:space_id(name, name_ar)')
      .eq('id', itemId)
      .eq('organisation_id', profile.organisation_id)
      .maybeSingle()
    if (data) setItem(data)

    const { data: moves } = await supabase
      .from('asset_log_movements')
      .select('id, from_space_name, to_space_name, note, moved_at')
      .eq('item_id', itemId)
      .eq('organisation_id', profile.organisation_id)
      .order('moved_at', { ascending: false })
      .limit(5)
    if (moves) setMovements(moves)
    setLoading(false)
  }

  useEffect(() => { load() }, [itemId, profile?.organisation_id])

  // Sites + spaces for the Move picker (only needed by non-requesters).
  useEffect(() => {
    if (!canEdit || !profile?.organisation_id) return
    ;(async () => {
      const [{ data: si }, { data: sp }] = await Promise.all([
        supabase.from('sites').select('id, name').eq('organisation_id', profile.organisation_id).order('name'),
        supabase.from('spaces').select('id, name, site_id').order('name'),
      ])
      if (si) setSites(si)
      if (sp) setSpaces(sp)
    })()
  }, [canEdit, profile?.organisation_id])

  // Compress + upload one image to the shared media bucket, return its public URL.
  async function uploadPhoto(uri: string): Promise<string> {
    const compressed = await ImageManipulator.manipulateAsync(
      uri, [{ resize: { width: 800 } }],
      { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG }
    )
    const filename = 'al-' + itemId + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10) + '.jpg'
    const response = await fetch(compressed.uri)
    const blob = await response.blob()
    const arrayBuffer = await new Response(blob).arrayBuffer()
    const { error } = await supabase.storage.from('media').upload(filename, arrayBuffer, { contentType: 'image/jpeg', upsert: false })
    if (error) throw new Error(error.message)
    const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(filename)
    return publicUrl
  }

  async function pickCondPhoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync()
    if (!perm.granted) { Alert.alert(t('camera_permission_required')); return }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.3, allowsEditing: true, aspect: [4, 3] as [number, number] })
    if (result.canceled) return
    setSavingCond(true)
    try {
      const url = await uploadPhoto(result.assets[0].uri)
      setCondPhoto(url)
    } catch (e: any) {
      Alert.alert(t('error'), e.message)
    }
    setSavingCond(false)
  }

  async function submitMove() {
    setMoving(true)
    // move_asset_log_item is SECURITY DEFINER but reads auth.uid() itself, so it
    // verifies the caller owns both the item and the target space server-side.
    const { error } = await supabase.rpc('move_asset_log_item', {
      p_item_id: itemId,
      p_to_space_id: moveSpaceId,
      p_note: moveNote.trim() || null,
    })
    setMoving(false)
    if (error) { Alert.alert(t('error'), error.message); return }
    setMoveOpen(false)
    setMoveNote(''); setMoveSpaceId(null); setMoveSiteId(null)
    await load()
    Alert.alert(t('done'), t('item_moved'))
  }

  async function submitCondition() {
    if (!profile?.organisation_id) return
    setSavingCond(true)
    const { error: insErr } = await supabase.from('asset_log_condition_reviews').insert({
      organisation_id: profile.organisation_id,
      item_id: itemId,
      rating,
      is_usable: usable,
      notes: condNotes.trim() || null,
      photo_urls: condPhoto ? [condPhoto] : [],
      reviewed_by: profile.id,
    })
    if (insErr) { setSavingCond(false); Alert.alert(t('error'), insErr.message); return }

    // Sync the denormalized condition fields onto the item (mirrors web AG-5).
    const { error: updErr } = await supabase.from('asset_log_items').update({
      condition_rating: rating,
      is_usable: usable,
      condition_notes: condNotes.trim() || null,
      last_condition_review_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', itemId).eq('organisation_id', profile.organisation_id)
    setSavingCond(false)
    if (updErr) { Alert.alert(t('error'), updErr.message); return }

    setCondOpen(false)
    setCondNotes(''); setCondPhoto(null)
    await load()
    Alert.alert(t('done'), t('condition_updated'))
  }

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
  const spaceOptions = spaces
    .filter(s => !moveSiteId || s.site_id === moveSiteId)
    .map(s => ({ value: s.id, label: s.name }))

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

      {canEdit && item.status !== 'disposed' && (
        <View style={styles.actions}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => setMoveOpen(true)}>
            <Ionicons name='swap-horizontal' size={18} color={colors.primary} />
            <Text style={styles.actionText}>{t('move')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => {
            setRating(item.condition_rating ?? 3)
            setUsable(item.is_usable ?? true)
            setCondOpen(true)
          }}>
            <Ionicons name='star-outline' size={18} color={colors.primary} />
            <Text style={styles.actionText}>{t('update_condition')}</Text>
          </TouchableOpacity>
        </View>
      )}

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

      {/* Move modal */}
      <Modal transparent animationType='slide' visible={moveOpen} onRequestClose={() => setMoveOpen(false)}>
        <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>{t('move')}</Text>
            <SelectField
              label={t('site')} placeholder={t('select_site')} value={moveSiteId}
              options={sites.map(s => ({ value: s.id, label: s.name }))}
              onChange={(v) => { setMoveSiteId(v); setMoveSpaceId(null) }}
            />
            <SelectField
              label={t('current_space')} placeholder={t('select_space')} value={moveSpaceId}
              options={spaceOptions} onChange={setMoveSpaceId}
            />
            <Text style={styles.label}>{t('note_optional')}</Text>
            <TextInput style={styles.input} value={moveNote} onChangeText={setMoveNote}
              placeholder={t('note_optional')} placeholderTextColor={colors.textLight} multiline />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setMoveOpen(false)}>
                <Text style={styles.cancelText}>{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={submitMove} disabled={moving}>
                {moving ? <ActivityIndicator color='white' size='small' /> : <Text style={styles.saveText}>{t('save')}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Condition modal */}
      <Modal transparent animationType='slide' visible={condOpen} onRequestClose={() => setCondOpen(false)}>
        <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>{t('update_condition')}</Text>

            <Text style={styles.label}>{t('rating')}</Text>
            <View style={styles.pillRow}>
              {[1, 2, 3, 4, 5].map(n => (
                <TouchableOpacity key={n} style={[styles.pill, rating === n && styles.pillActive]} onPress={() => setRating(n)}>
                  <Text style={[styles.pillText, rating === n && styles.pillTextActive]}>{n}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={styles.usableToggle} onPress={() => setUsable(u => !u)}>
              <Ionicons name={usable ? 'checkbox' : 'square-outline'} size={22} color={usable ? colors.success : colors.textLight} />
              <Text style={styles.usableToggleText}>{t('usable')}</Text>
            </TouchableOpacity>

            <Text style={styles.label}>{t('notes')}</Text>
            <TextInput style={styles.input} value={condNotes} onChangeText={setCondNotes}
              placeholder={t('notes')} placeholderTextColor={colors.textLight} multiline />

            <TouchableOpacity style={styles.photoBtn} onPress={pickCondPhoto} disabled={savingCond}>
              <Ionicons name='camera-outline' size={18} color={colors.primary} />
              <Text style={styles.actionText}>{condPhoto ? t('photos') : t('add_photo')}</Text>
            </TouchableOpacity>
            {condPhoto ? <Image source={{ uri: condPhoto }} style={styles.photo} contentFit='cover' /> : null}

            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setCondOpen(false)}>
                <Text style={styles.cancelText}>{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={submitCondition} disabled={savingCond}>
                {savingCond ? <ActivityIndicator color='white' size='small' /> : <Text style={styles.saveText}>{t('save')}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  actions: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingTop: 14 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: 'white', borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 12, ...shadow.sm },
  actionText: { fontSize: 14, fontWeight: '600', color: colors.primary },
  card: { backgroundColor: 'white', margin: 16, marginBottom: 0, borderRadius: radius.md, padding: 16, ...shadow.sm },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  starRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  usable: { marginLeft: 8, fontSize: 13, fontWeight: '500', color: colors.textSecondary },
  notes: { fontSize: 13, color: colors.text, marginTop: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowLabel: { fontSize: 13, color: colors.textSecondary },
  rowValue: { fontSize: 13, fontWeight: '500', color: colors.text, maxWidth: '60%', textAlign: 'right' },
  photoWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photo: { width: 88, height: 88, borderRadius: radius.sm, marginTop: 10 },
  moveRow: { flexDirection: 'row', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  moveText: { fontSize: 13, fontWeight: '500', color: colors.text },
  moveNote: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  moveDate: { fontSize: 11, color: colors.textLight, marginTop: 2 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  modalSheet: { backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32 },
  modalTitle: { fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: 6 },
  input: { backgroundColor: 'white', borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 12, fontSize: 14, color: colors.text, minHeight: 60, textAlignVertical: 'top', marginBottom: 14 },
  pillRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  pill: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: 'white' },
  pillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  pillText: { fontSize: 15, fontWeight: '600', color: colors.textSecondary },
  pillTextActive: { color: 'white' },
  usableToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  usableToggleText: { fontSize: 14, color: colors.text },
  photoBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: 'white', borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 12, marginBottom: 4 },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 20 },
  cancelBtn: { flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  cancelText: { fontSize: 15, fontWeight: '600', color: colors.textSecondary },
  saveBtn: { flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: radius.md, backgroundColor: colors.primary },
  saveText: { fontSize: 15, fontWeight: '600', color: 'white' },
})
