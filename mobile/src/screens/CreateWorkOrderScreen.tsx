import React, { useEffect, useLayoutEffect, useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native'
import { Image } from 'expo-image'
import { useNavigation } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import * as ImageManipulator from 'expo-image-manipulator'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LangContext'
import { colors, radius, shadow } from '../lib/theme'
import { CATEGORIES } from '../lib/categories'
import SelectField from '../components/SelectField'
import { format } from 'date-fns'

type DueOption = { key: string; labelKey: string; days: number | null }

const DUE_OPTIONS: DueOption[] = [
  { key: 'none', labelKey: 'none', days: null },
  { key: 'today', labelKey: 'today', days: 0 },
  { key: 'tomorrow', labelKey: 'tomorrow', days: 1 },
  { key: 'plus3', labelKey: 'in_3_days', days: 3 },
  { key: 'plus7', labelKey: 'in_1_week', days: 7 },
]

function dueAtFromDays(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(17, 0, 0, 0) // end of working day
  return d.toISOString()
}

export default function CreateWorkOrderScreen() {
  const navigation = useNavigation<any>()
  const { profile } = useAuth()
  const { t } = useLang()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('medium')
  const [category, setCategory] = useState<string | null>(null)
  const [siteId, setSiteId] = useState<string | null>(null)
  const [assetId, setAssetId] = useState<string | null>(null)
  const [dueKey, setDueKey] = useState('none')
  const [photoUrls, setPhotoUrls] = useState<string[]>([])
  const [sites, setSites] = useState<any[]>([])
  const [assets, setAssets] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  useLayoutEffect(() => {
    navigation.setOptions({ title: t('create_work_order') })
  }, [navigation, t])

  useEffect(() => { fetchOptions() }, [profile?.id])

  async function fetchOptions() {
    if (!profile?.organisation_id) return
    const [sitesRes, assetsRes] = await Promise.all([
      supabase.from('sites').select('id, name')
        .eq('organisation_id', profile.organisation_id)
        .order('name', { ascending: true }),
      supabase.from('assets').select('id, name, site_id')
        .eq('organisation_id', profile.organisation_id)
        .order('name', { ascending: true }),
    ])
    if (sitesRes.data) setSites(sitesRes.data)
    if (assetsRes.data) setAssets(assetsRes.data)
  }

  function onSiteChange(value: string | null) {
    setSiteId(value)
    // Clear the asset if it belongs to a different site.
    if (value && assetId) {
      const asset = assets.find(a => a.id === assetId)
      if (asset?.site_id && asset.site_id !== value) setAssetId(null)
    }
  }

  function onAssetChange(value: string | null) {
    setAssetId(value)
    // Selecting an asset with a site auto-selects its site.
    if (value) {
      const asset = assets.find(a => a.id === value)
      if (asset?.site_id) setSiteId(asset.site_id)
    }
  }

  async function pickPhoto(fromCamera: boolean) {
    if (fromCamera) {
      const perm = await ImagePicker.requestCameraPermissionsAsync()
      if (!perm.granted) { Alert.alert(t('camera_permission_required')); return }
    } else {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!perm.granted) { Alert.alert(t('gallery_permission_required')); return }
    }
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.3, allowsEditing: true, aspect: [4, 3] as [number, number] })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.4, allowsEditing: false })
    if (result.canceled) return
    setUploading(true)
    try {
      const originalUri = result.assets[0].uri
      // Compress and resize to max 800px
      const compressed = await ImageManipulator.manipulateAsync(
        originalUri,
        [{ resize: { width: 800 } }],
        { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG }
      )
      // Random suffix keeps the public-bucket filename unguessable, and
      // upsert: false guarantees we never overwrite an existing object.
      const filename = 'wo-new-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10) + '.jpg'
      const response = await fetch(compressed.uri)
      const blob = await response.blob()
      const arrayBuffer = await new Response(blob).arrayBuffer()
      const { error } = await supabase.storage.from('media').upload(filename, arrayBuffer, { contentType: 'image/jpeg', upsert: false })
      if (error) { Alert.alert(t('photo_upload_failed'), error.message); setUploading(false); return }
      const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(filename)
      setPhotoUrls(prev => [...prev, publicUrl])
    } catch (e: any) {
      Alert.alert(t('error'), e.message)
    }
    setUploading(false)
  }

  function removePhoto(url: string) {
    setPhotoUrls(prev => prev.filter(u => u !== url))
  }

  async function create() {
    if (!title.trim()) { Alert.alert(t('error'), t('title_required')); return }
    if (!profile?.organisation_id) { Alert.alert(t('error'), t('org_not_loaded')); return }
    setSaving(true)
    const dueOption = DUE_OPTIONS.find(o => o.key === dueKey)
    const { error } = await supabase.from('work_orders').insert({
      organisation_id: profile.organisation_id,
      created_by: profile.id,
      title: title.trim(),
      description: description.trim() ? description.trim() : null,
      priority,
      category,
      site_id: siteId,
      asset_id: assetId,
      due_at: dueOption?.days != null ? dueAtFromDays(dueOption.days) : null,
      status: 'new',
      source: 'manual',
      photo_urls: photoUrls,
    })
    setSaving(false)
    if (error) { Alert.alert(t('error'), error.message || t('create_failed')); return }
    Alert.alert(t('done'), t('wo_created'))
    navigation.goBack()
  }

  const priorityOptions = [
    { key: 'low', label: t('low') },
    { key: 'medium', label: t('medium') },
    { key: 'high', label: t('high') },
    { key: 'critical', label: t('critical') },
  ]
  const filteredAssets = siteId ? assets.filter(a => !a.site_id || a.site_id === siteId) : assets
  const dueOption = DUE_OPTIONS.find(o => o.key === dueKey)

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps='handled'>
        <View style={styles.card}>
          <View style={styles.field}>
            <Text style={styles.label}>{t('title')} *</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder={t('title')}
              placeholderTextColor={colors.textLight}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>{t('description')}</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={description}
              onChangeText={setDescription}
              placeholder={t('description')}
              placeholderTextColor={colors.textLight}
              multiline
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>{t('priority')}</Text>
            <View style={styles.pillRow}>
              {priorityOptions.map(p => {
                const pc = colors.priority[p.key as keyof typeof colors.priority]
                const active = priority === p.key
                return (
                  <TouchableOpacity key={p.key} onPress={() => setPriority(p.key)}
                    style={[styles.pill, active && { backgroundColor: pc.bg, borderColor: pc.text }]}>
                    <Text style={[styles.pillText, active && { color: pc.text, fontWeight: '700' }]}>{p.label}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>

          <SelectField
            label={t('category')}
            placeholder={t('select_category')}
            value={category}
            options={CATEGORIES.map(c => ({ value: c.value, label: t(c.labelKey) }))}
            onChange={setCategory}
          />

          <SelectField
            label={t('site')}
            placeholder={t('select_site')}
            value={siteId}
            options={sites.map(s => ({ value: s.id, label: s.name }))}
            onChange={onSiteChange}
          />

          <SelectField
            label={t('asset')}
            placeholder={t('select_asset')}
            value={assetId}
            options={filteredAssets.map(a => ({ value: a.id, label: a.name }))}
            onChange={onAssetChange}
          />

          <View style={styles.field}>
            <Text style={styles.label}>{t('due_date')}</Text>
            <View style={styles.pillRow}>
              {DUE_OPTIONS.map(o => {
                const active = dueKey === o.key
                return (
                  <TouchableOpacity key={o.key} onPress={() => setDueKey(o.key)}
                    style={[styles.pill, active && styles.pillActive]}>
                    <Text style={[styles.pillText, active && styles.pillTextActive]}>{t(o.labelKey)}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>
            {dueOption?.days != null && (
              <Text style={styles.dueHint}>{format(new Date(dueAtFromDays(dueOption.days)), 'dd MMM yyyy, HH:mm')}</Text>
            )}
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>{t('photos')}</Text>
            <View style={styles.photoActions}>
              <TouchableOpacity style={styles.photoBtn} onPress={() => pickPhoto(true)} disabled={uploading}>
                <Ionicons name='camera-outline' size={18} color={colors.primary} />
                <Text style={styles.photoBtnText}>{t('take_photo')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.photoBtn} onPress={() => pickPhoto(false)} disabled={uploading}>
                <Ionicons name='images-outline' size={18} color={colors.primary} />
                <Text style={styles.photoBtnText}>{t('upload_photo')}</Text>
              </TouchableOpacity>
            </View>
            {uploading && <ActivityIndicator color={colors.primary} style={{ marginVertical: 12 }} />}
            {photoUrls.length > 0 && (
              <View style={styles.photoGrid}>
                {photoUrls.map(url => (
                  <View key={url}>
                    <Image source={{ uri: url }} style={styles.photo} contentFit='cover' transition={200} />
                    <TouchableOpacity style={styles.photoRemove} onPress={() => removePhoto(url)}
                      accessibilityLabel={t('remove')}>
                      <Ionicons name='close' size={14} color='white' />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>

        <TouchableOpacity style={styles.submitBtn} onPress={create} disabled={saving || uploading}>
          {saving
            ? <ActivityIndicator color='white' size='small' />
            : <Text style={styles.submitBtnText}>{t('create')}</Text>
          }
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  card: { backgroundColor: 'white', borderRadius: radius.md, padding: 16, ...shadow.sm },
  field: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: 6 },
  input: { backgroundColor: 'white', borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 12, fontSize: 14, color: colors.text },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.full, backgroundColor: 'white', borderWidth: 1, borderColor: colors.border },
  pillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  pillText: { fontSize: 13, color: colors.textSecondary },
  pillTextActive: { color: 'white', fontWeight: '600' },
  dueHint: { fontSize: 12, color: colors.textLight, marginTop: 6 },
  photoActions: { flexDirection: 'row', gap: 12 },
  photoBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.infoLight },
  photoBtnText: { fontSize: 13, color: colors.primary, fontWeight: '500' },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  photo: { width: 80, height: 80, borderRadius: radius.sm, backgroundColor: colors.border },
  photoRemove: { position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  submitBtn: { marginTop: 16, backgroundColor: colors.primary, borderRadius: radius.md, padding: 16, alignItems: 'center' },
  submitBtnText: { color: 'white', fontSize: 15, fontWeight: '600' },
})
