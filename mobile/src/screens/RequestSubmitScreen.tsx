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

// MKT-10 / CORE-23: submit through the SAME public service-role endpoint the web
// /request wizard uses. A requester has SELECT-only RLS on `requests` (w5-6
// my-requests), so a direct client insert is blocked; the endpoint validates the
// site against the org and fires the confirmation email + admin notify + webhook.
// ponytail: same base URL as webApi.ts (private const there); one line beats
// exporting/importing across a file another W6 track may also touch.
const SUBMIT_URL = 'https://www.serviqfm.com/api/requests/submit'

export default function RequestSubmitScreen() {
  const navigation = useNavigation<any>()
  const { profile } = useAuth()
  const { t, lang } = useLang()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<string | null>(null)
  const [siteId, setSiteId] = useState<string | null>(null)
  const [sites, setSites] = useState<any[]>([])
  const [photoUrls, setPhotoUrls] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  const ar = lang === 'ar'

  useLayoutEffect(() => {
    navigation.setOptions({ title: ar ? 'تقديم طلب' : 'Submit Request' })
  }, [navigation, ar])

  useEffect(() => { fetchSites() }, [profile?.id])

  async function fetchSites() {
    if (!profile?.organisation_id) return
    const { data } = await supabase.from('sites').select('id, name')
      .eq('organisation_id', profile.organisation_id)
      .eq('is_active', true)
      .order('name', { ascending: true })
    if (data) setSites(data)
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
      const compressed = await ImageManipulator.manipulateAsync(
        result.assets[0].uri,
        [{ resize: { width: 800 } }],
        { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG }
      )
      // Random suffix keeps the public-bucket filename unguessable; upsert:false
      // guarantees we never clobber an existing object. Mirrors CreateWorkOrder.
      const filename = 'req-new-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10) + '.jpg'
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

  async function submit() {
    if (!title.trim()) { Alert.alert(t('error'), t('title_required')); return }
    if (!description.trim()) { Alert.alert(t('error'), ar ? 'الوصف مطلوب' : 'Description is required'); return }
    if (!category) { Alert.alert(t('error'), ar ? 'الفئة مطلوبة' : 'Category is required'); return }
    // requests.site_id is NOT NULL — a site is mandatory (matches the web wizard).
    if (!siteId) {
      Alert.alert(t('error'), sites.length === 0
        ? (ar ? 'لا توجد مواقع مهيأة لمؤسستك. يرجى التواصل مع المسؤول.' : 'No sites configured for your organisation. Please contact an administrator.')
        : (ar ? 'يرجى اختيار الموقع' : 'Please select a site'))
      return
    }
    if (!profile?.organisation_id) { Alert.alert(t('error'), t('org_not_loaded')); return }

    setSaving(true)
    let res: Response
    try {
      res = await fetch(SUBMIT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // org id, name and email come from the signed-in profile — never a
        // user-typed field. The endpoint re-validates site_id against the org.
        body: JSON.stringify({
          organisation_id: profile.organisation_id,
          site_id: siteId,
          requester_name: profile.full_name ?? profile.email ?? '',
          requester_email: profile.email ?? '',
          title: title.trim(),
          description: description.trim(),
          category,
          photo_urls: photoUrls,
        }),
      })
    } catch (e: any) {
      setSaving(false)
      Alert.alert(t('error'), e?.message || (ar ? 'خطأ في الشبكة' : 'Network error'))
      return
    }
    setSaving(false)
    if (!res.ok) {
      let msg = ar ? 'فشل الإرسال. يرجى المحاولة مرة أخرى.' : 'Submission failed. Please try again.'
      try { const j = await res.json(); if (j?.error) msg = j.error } catch {}
      Alert.alert(t('error'), msg)
      return
    }
    Alert.alert(t('done'), ar ? 'تم إرسال طلبك وهو قيد المراجعة.' : 'Your request has been submitted and is pending review.')
    navigation.goBack()
  }

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
            <Text style={styles.label}>{t('description')} *</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={description}
              onChangeText={setDescription}
              placeholder={t('description')}
              placeholderTextColor={colors.textLight}
              multiline
            />
          </View>

          <SelectField
            label={t('category') + ' *'}
            placeholder={t('select_category')}
            value={category}
            options={CATEGORIES.map(c => ({ value: c.value, label: t(c.labelKey) }))}
            onChange={setCategory}
            allowNone={false}
          />

          <SelectField
            label={t('site') + ' *'}
            placeholder={t('select_site')}
            value={siteId}
            options={sites.map(s => ({ value: s.id, label: s.name }))}
            onChange={setSiteId}
            allowNone={false}
          />

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

        <TouchableOpacity style={styles.submitBtn} onPress={submit} disabled={saving || uploading}>
          {saving
            ? <ActivityIndicator color='white' size='small' />
            : <Text style={styles.submitBtnText}>{t('submit')}</Text>
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
  photoActions: { flexDirection: 'row', gap: 12 },
  photoBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.infoLight },
  photoBtnText: { fontSize: 13, color: colors.primary, fontWeight: '500' },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  photo: { width: 80, height: 80, borderRadius: radius.sm, backgroundColor: colors.border },
  photoRemove: { position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  submitBtn: { marginTop: 16, backgroundColor: colors.primary, borderRadius: radius.md, padding: 16, alignItems: 'center' },
  submitBtnText: { color: 'white', fontSize: 15, fontWeight: '600' },
})
