// CORE-25 — run inspections on mobile. Mirrors the web run flow at
// /dashboard/inspections/new: pick a template (+ optional site/space/asset,
// pre-filled when opened from an inspection WO deep-link), answer the
// checklist, submit to inspection_results, and auto-create a high-priority WO
// per failed item.
//
// ponytail: failed-item→WO logic is duplicated from the web client (extracting
// a shared server route is the upgrade path); runs online-only — offline
// inspection submit is a follow-up.

import React, { useEffect, useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native'
import { Image } from 'expo-image'
import { useNavigation, useRoute } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import * as ImageManipulator from 'expo-image-manipulator'
import { supabase } from '../lib/supabase'
import { isOnline } from '../lib/offline'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LangContext'
import { colors, radius, shadow } from '../lib/theme'
import SelectField from '../components/SelectField'

type Params = { templateId?: string; siteId?: string; spaceId?: string }

export default function RunInspectionScreen() {
  const navigation = useNavigation<any>()
  const route = useRoute<any>()
  const params: Params = route.params ?? {}
  const { profile } = useAuth()
  const { t, lang } = useLang()

  const [templates, setTemplates] = useState<any[]>([])
  const [sites, setSites] = useState<any[]>([])
  const [spaces, setSpaces] = useState<any[]>([])
  const [assets, setAssets] = useState<any[]>([])
  const [templateId, setTemplateId] = useState<string | null>(params.templateId ?? null)
  const [siteId, setSiteId] = useState<string | null>(params.siteId ?? null)
  const [spaceId, setSpaceId] = useState<string | null>(params.spaceId ?? null)
  const [assetId, setAssetId] = useState<string | null>(null)
  const [responses, setResponses] = useState<Record<string, any>>({})
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [step, setStep] = useState<'setup' | 'checklist'>('setup')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [uploadingItem, setUploadingItem] = useState<string | null>(null)

  const selectedTemplate = templates.find(tm => tm.id === templateId) ?? null
  const items: any[] = selectedTemplate?.items ?? []

  useEffect(() => { loadData() }, [profile?.organisation_id])

  async function loadData() {
    if (!profile?.organisation_id) return
    const [tmplRes, sitesRes, assetsRes] = await Promise.all([
      supabase.from('inspection_templates').select('*')
        .eq('organisation_id', profile.organisation_id).order('name'),
      supabase.from('sites').select('id, name')
        .eq('organisation_id', profile.organisation_id).eq('is_active', true).order('name'),
      supabase.from('assets').select('id, name')
        .eq('organisation_id', profile.organisation_id).eq('status', 'active').order('name'),
    ])
    if (tmplRes.data) setTemplates(tmplRes.data)
    if (sitesRes.data) setSites(sitesRes.data)
    if (assetsRes.data) setAssets(assetsRes.data)
    setLoading(false)
  }

  // Load the chosen site's spaces; keep a pre-filled space (deep link) only if
  // it belongs to this site — mirrors the web run page.
  useEffect(() => {
    if (!siteId) { setSpaces([]); setSpaceId(null); return }
    supabase.from('spaces').select('id, name, floor').eq('site_id', siteId).order('floor').order('name')
      .then(({ data }) => {
        setSpaces(data ?? [])
        setSpaceId(prev => (data ?? []).some((s: any) => s.id === prev) ? prev : null)
      })
  }, [siteId])

  function setResponse(itemId: string, value: any) {
    setResponses(prev => ({ ...prev, [itemId]: value }))
  }

  async function addItemPhoto(itemId: string) {
    if (!isOnline()) { Alert.alert(t('offline'), t('offline_inspection_blocked')); return }
    const perm = await ImagePicker.requestCameraPermissionsAsync()
    if (!perm.granted) { Alert.alert(t('camera_permission_required')); return }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.3, allowsEditing: true, aspect: [4, 3] as [number, number] })
    if (result.canceled) return
    setUploadingItem(itemId)
    try {
      const compressed = await ImageManipulator.manipulateAsync(
        result.assets[0].uri,
        [{ resize: { width: 800 } }],
        { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG }
      )
      const filename = 'inspection-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10) + '.jpg'
      const response = await fetch(compressed.uri)
      const blob = await response.blob()
      const arrayBuffer = await new Response(blob).arrayBuffer()
      const { error } = await supabase.storage.from('media').upload(filename, arrayBuffer, { contentType: 'image/jpeg', upsert: false })
      if (error) throw new Error(error.message)
      const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(filename)
      setResponse(itemId, publicUrl)
    } catch (e: any) {
      Alert.alert(t('photo_upload_failed'), e.message)
    }
    setUploadingItem(null)
  }

  async function handleSubmit() {
    if (!selectedTemplate || !profile?.organisation_id) return
    if (!isOnline()) { Alert.alert(t('offline'), t('offline_inspection_blocked')); return }

    const unanswered = items.filter((item: any) => {
      if (!item.required) return false
      const resp = responses[item.id]
      return resp === undefined || resp === null || resp === ''
    })
    if (unanswered.length > 0) {
      Alert.alert(t('error'), t('required_remaining', { count: unanswered.length }))
      return
    }

    setSubmitting(true)
    const failedItems = items.filter((item: any) => item.type === 'pass_fail' && responses[item.id] === 'fail')
    // Overall result mirrors the web calc; 'na' answers are excluded from the
    // pass/fail denominator.
    const counted = items.filter((i: any) => i.type === 'pass_fail' && responses[i.id] !== 'na')
    const overallResult = counted.length === 0 ? 'pass' :
      failedItems.length === 0 ? 'pass' :
      failedItems.length === counted.length ? 'fail' : 'partial'

    const responsesArray = items.map((item: any) => ({
      item_id: item.id,
      label: item.label,
      type: item.type,
      value: responses[item.id] ?? null,
      note: notes[item.id]?.trim() || null,
      required: item.required,
    }))

    const { error: insertError } = await supabase
      .from('inspection_results')
      .insert({
        template_id: selectedTemplate.id,
        site_id: siteId,
        space_id: spaceId,
        asset_id: assetId,
        conducted_by: profile.id,
        organisation_id: profile.organisation_id,
        status: 'completed',
        overall_result: overallResult,
        responses: responsesArray,
        completed_at: new Date().toISOString(),
      })
    if (insertError) {
      setSubmitting(false)
      Alert.alert(t('error'), insertError.message)
      return
    }

    // Auto-create a WO per failed item — same client-side logic as the web run page.
    for (const item of failedItems) {
      const { error: woError } = await supabase.from('work_orders').insert({
        title: 'Inspection Fail: ' + item.label,
        description: 'Auto-created from failed inspection: ' + selectedTemplate.name,
        priority: 'high',
        status: 'new',
        source: 'manual',
        site_id: siteId,
        space_id: spaceId,
        asset_id: assetId,
        organisation_id: profile.organisation_id,
        created_by: profile.id,
      })
      if (woError) console.log('WO creation error:', JSON.stringify(woError))
    }

    setSubmitting(false)
    Alert.alert(
      t('done'),
      t('inspection_submitted') + (failedItems.length > 0 ? '\n' + t('inspection_failed_wos', { count: failedItems.length }) : '')
    )
    navigation.goBack()
  }

  if (loading) return <View style={styles.centered}><ActivityIndicator color={colors.primary} /></View>

  if (step === 'setup') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={styles.content} keyboardShouldPersistTaps='handled'>
        <View style={styles.card}>
          <SelectField
            label={t('template') + ' *'}
            placeholder={t('select_template')}
            value={templateId}
            options={templates.map(tm => ({ value: tm.id, label: tm.name + (tm.vertical ? ' (' + tm.vertical + ')' : '') }))}
            onChange={setTemplateId}
            allowNone={false}
          />
          {templates.length === 0 && (
            <Text style={styles.warnText}>{t('no_templates')}</Text>
          )}

          <SelectField
            label={t('site')}
            placeholder={t('select_site')}
            value={siteId}
            options={sites.map(s => ({ value: s.id, label: s.name }))}
            onChange={setSiteId}
          />

          {siteId ? (
            <SelectField
              label={t('space')}
              placeholder={t('select_space')}
              value={spaceId}
              options={spaces.map(s => ({ value: s.id, label: (s.floor ? s.floor + ' · ' : '') + s.name }))}
              onChange={setSpaceId}
            />
          ) : null}

          <SelectField
            label={t('asset')}
            placeholder={t('select_asset')}
            value={assetId}
            options={assets.map(a => ({ value: a.id, label: a.name }))}
            onChange={setAssetId}
          />

          {selectedTemplate && (
            <View style={styles.templateInfo}>
              <Text style={styles.templateName}>{selectedTemplate.name}</Text>
              <Text style={styles.templateMeta}>{t('checklist_items', { count: items.length })}</Text>
            </View>
          )}
        </View>

        <TouchableOpacity
          style={[styles.submitBtn, !templateId && { opacity: 0.6 }]}
          disabled={!templateId}
          onPress={() => setStep('checklist')}>
          <Text style={styles.submitBtnText}>{t('begin_checklist')}</Text>
        </TouchableOpacity>
      </ScrollView>
    )
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps='handled'>
        <View style={styles.setupSummary}>
          <Text style={styles.setupSummaryText} numberOfLines={1}>
            {selectedTemplate?.name}
            {siteId ? ' · ' + (sites.find(s => s.id === siteId)?.name ?? '') : ''}
          </Text>
          <TouchableOpacity onPress={() => setStep('setup')}>
            <Text style={styles.changeSetup}>{t('change_setup')}</Text>
          </TouchableOpacity>
        </View>

        {items.map((item: any, idx: number) => {
          const value = responses[item.id]
          return (
            <View key={item.id} style={[styles.itemCard, value === 'fail' && { backgroundColor: '#fff8f8' }]}>
              <Text style={styles.itemLabel}>
                {idx + 1}. {lang === 'ar' && item.label_ar ? item.label_ar : item.label}
                {item.required ? <Text style={{ color: colors.error }}> *</Text> : null}
              </Text>

              {item.type === 'pass_fail' && (
                <View style={styles.optionRow}>
                  {[
                    { v: 'pass', label: t('pass'), color: colors.success, bg: colors.successLight },
                    { v: 'fail', label: t('fail'), color: colors.error, bg: colors.errorLight },
                    { v: 'na', label: t('na'), color: colors.textSecondary, bg: colors.background },
                  ].map(opt => (
                    <TouchableOpacity key={opt.v} onPress={() => setResponse(item.id, opt.v)}
                      style={[styles.optionBtn, { borderColor: value === opt.v ? opt.color : colors.border, backgroundColor: value === opt.v ? opt.bg : 'white' }]}>
                      <Text style={[styles.optionBtnText, { color: value === opt.v ? opt.color : colors.textSecondary }]}>{opt.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {item.type === 'yes_no' && (
                <View style={styles.optionRow}>
                  {[{ v: 'yes', label: t('yes') }, { v: 'no', label: t('no') }].map(opt => (
                    <TouchableOpacity key={opt.v} onPress={() => setResponse(item.id, opt.v)}
                      style={[styles.optionBtn, { borderColor: value === opt.v ? colors.info : colors.border, backgroundColor: value === opt.v ? colors.infoLight : 'white' }]}>
                      <Text style={[styles.optionBtnText, { color: value === opt.v ? colors.info : colors.textSecondary }]}>{opt.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {item.type === 'score' && (
                <View style={styles.optionRow}>
                  {[1, 2, 3, 4, 5].map(v => (
                    <TouchableOpacity key={v} onPress={() => setResponse(item.id, v)}
                      style={[styles.scoreBtn, value === v && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                      <Text style={[styles.scoreBtnText, value === v && { color: 'white' }]}>{v}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {item.type === 'text' && (
                <TextInput
                  style={styles.input}
                  value={value ?? ''}
                  onChangeText={txt => setResponse(item.id, txt)}
                  placeholder={t('notes')}
                  placeholderTextColor={colors.textLight}
                  multiline
                />
              )}

              {item.type === 'photo' && (
                <View>
                  {value ? <Image source={{ uri: value }} style={styles.photo} contentFit='cover' transition={200} /> : null}
                  <TouchableOpacity style={styles.photoBtn} onPress={() => addItemPhoto(item.id)} disabled={uploadingItem === item.id}>
                    {uploadingItem === item.id
                      ? <ActivityIndicator color={colors.primary} size='small' />
                      : (<><Ionicons name='camera-outline' size={18} color={colors.primary} /><Text style={styles.photoBtnText}>{value ? t('take_photo') : t('add_photo')}</Text></>)}
                  </TouchableOpacity>
                </View>
              )}

              {item.type !== 'text' && (
                <TextInput
                  style={styles.noteInput}
                  value={notes[item.id] ?? ''}
                  onChangeText={txt => setNotes(prev => ({ ...prev, [item.id]: txt }))}
                  placeholder={t('note_optional')}
                  placeholderTextColor={colors.textLight}
                />
              )}
            </View>
          )
        })}

        <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit} disabled={submitting || uploadingItem !== null}>
          {submitting
            ? <ActivityIndicator color='white' size='small' />
            : <Text style={styles.submitBtnText}>{t('submit_inspection')}</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 40 },
  card: { backgroundColor: 'white', borderRadius: radius.md, padding: 16, ...shadow.sm },
  warnText: { fontSize: 12, color: colors.warning, marginTop: -6, marginBottom: 10 },
  templateInfo: { backgroundColor: colors.background, borderRadius: radius.sm, padding: 12, marginTop: 4 },
  templateName: { fontSize: 13, fontWeight: '600', color: colors.text },
  templateMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  setupSummary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, backgroundColor: 'white', borderRadius: radius.sm, padding: 12, marginBottom: 10, ...shadow.sm },
  setupSummaryText: { flex: 1, fontSize: 13, color: colors.textSecondary },
  changeSetup: { fontSize: 12, color: colors.primary, fontWeight: '600' },
  itemCard: { backgroundColor: 'white', borderRadius: radius.md, padding: 14, marginBottom: 10, ...shadow.sm },
  itemLabel: { fontSize: 14, fontWeight: '500', color: colors.text, marginBottom: 10, lineHeight: 20 },
  optionRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  optionBtn: { paddingHorizontal: 20, paddingVertical: 9, borderRadius: radius.sm, borderWidth: 2 },
  optionBtnText: { fontSize: 14, fontWeight: '600' },
  scoreBtn: { width: 44, height: 44, borderRadius: radius.sm, borderWidth: 2, borderColor: colors.border, backgroundColor: 'white', alignItems: 'center', justifyContent: 'center' },
  scoreBtnText: { fontSize: 15, fontWeight: '700', color: colors.textSecondary },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colors.text, minHeight: 44 },
  noteInput: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, color: colors.text, marginTop: 10 },
  photo: { width: 100, height: 100, borderRadius: radius.sm, backgroundColor: colors.border, marginBottom: 8 },
  photoBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 10, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.infoLight },
  photoBtnText: { fontSize: 13, color: colors.primary, fontWeight: '500' },
  submitBtn: { marginTop: 12, backgroundColor: colors.primary, borderRadius: radius.md, padding: 16, alignItems: 'center' },
  submitBtnText: { color: 'white', fontSize: 15, fontWeight: '600' },
})
