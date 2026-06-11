import React, { useEffect, useLayoutEffect, useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native'
import { useNavigation, useRoute } from '@react-navigation/native'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LangContext'
import { colors, radius, shadow } from '../lib/theme'
import { CATEGORIES } from '../lib/categories'
import SelectField from '../components/SelectField'

// Handles both create (no params) and edit (route.params.asset = existing row).
export default function CreateAssetScreen() {
  const navigation = useNavigation<any>()
  const route = useRoute<any>()
  const { profile } = useAuth()
  const { t } = useLang()

  const editing: any | null = route.params?.asset ?? null

  const [name, setName] = useState(editing?.name ?? '')
  const [nameAr, setNameAr] = useState(editing?.name_ar ?? '')
  const [category, setCategory] = useState<string | null>(editing?.category ?? null)
  const [siteId, setSiteId] = useState<string | null>(editing?.site_id ?? null)
  const [subLocation, setSubLocation] = useState(editing?.sub_location ?? '')
  const [serialNumber, setSerialNumber] = useState(editing?.serial_number ?? '')
  const [manufacturer, setManufacturer] = useState(editing?.manufacturer ?? '')
  const [model, setModel] = useState(editing?.model ?? '')
  const [description, setDescription] = useState(editing?.description ?? '')
  const [sites, setSites] = useState<any[]>([])
  const [saving, setSaving] = useState(false)

  useLayoutEffect(() => {
    navigation.setOptions({ title: editing ? t('edit_asset') : t('create_asset') })
  }, [navigation, t, editing])

  useEffect(() => { fetchSites() }, [profile?.id])

  async function fetchSites() {
    if (!profile?.organisation_id) return
    const { data } = await supabase.from('sites').select('id, name')
      .eq('organisation_id', profile.organisation_id)
      .order('name', { ascending: true })
    if (data) setSites(data)
  }

  async function save() {
    if (!name.trim()) { Alert.alert(t('error'), t('name_required')); return }
    if (!profile?.organisation_id) { Alert.alert(t('error'), t('org_not_loaded')); return }
    setSaving(true)

    const fields = {
      name: name.trim(),
      name_ar: nameAr.trim() ? nameAr.trim() : null,
      category,
      site_id: siteId,
      sub_location: subLocation.trim() ? subLocation.trim() : null,
      serial_number: serialNumber.trim() ? serialNumber.trim() : null,
      manufacturer: manufacturer.trim() ? manufacturer.trim() : null,
      model: model.trim() ? model.trim() : null,
      description: description.trim() ? description.trim() : null,
    }

    let error
    if (editing) {
      const res = await supabase.from('assets')
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq('id', editing.id)
        .eq('organisation_id', profile.organisation_id)
      error = res.error
    } else {
      // QR code format matches the web convention (web/src/app/api/assets/route.ts).
      const qrCode = 'SERVIQ-' + Date.now() + '-' + Math.random().toString(36).substring(2, 11).toUpperCase()
      const res = await supabase.from('assets').insert({
        ...fields,
        organisation_id: profile.organisation_id,
        created_by: profile.id,
        status: 'active',
        qr_code: qrCode,
      })
      error = res.error
    }

    setSaving(false)
    if (error) { Alert.alert(t('error'), error.message || t('create_failed')); return }
    Alert.alert(t('done'), editing ? t('asset_updated') : t('asset_created'))
    navigation.goBack()
  }

  const textFields: { label: string; value: string; onChange: (v: string) => void; rtl?: boolean }[] = [
    { label: t('sub_location'), value: subLocation, onChange: setSubLocation },
    { label: t('serial_number'), value: serialNumber, onChange: setSerialNumber },
    { label: t('manufacturer'), value: manufacturer, onChange: setManufacturer },
    { label: t('model'), value: model, onChange: setModel },
  ]

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps='handled'>
        <View style={styles.card}>
          <View style={styles.field}>
            <Text style={styles.label}>{t('name')} *</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder={t('name')}
              placeholderTextColor={colors.textLight}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>{t('name_ar')}</Text>
            <TextInput
              style={styles.input}
              value={nameAr}
              onChangeText={setNameAr}
              placeholder={t('name_ar')}
              placeholderTextColor={colors.textLight}
            />
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
            onChange={setSiteId}
          />

          {textFields.map(f => (
            <View key={f.label} style={styles.field}>
              <Text style={styles.label}>{f.label}</Text>
              <TextInput
                style={styles.input}
                value={f.value}
                onChangeText={f.onChange}
                placeholder={f.label}
                placeholderTextColor={colors.textLight}
              />
            </View>
          ))}

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
        </View>

        <TouchableOpacity style={styles.submitBtn} onPress={save} disabled={saving}>
          {saving
            ? <ActivityIndicator color='white' size='small' />
            : <Text style={styles.submitBtnText}>{editing ? t('save') : t('create')}</Text>
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
  submitBtn: { marginTop: 16, backgroundColor: colors.primary, borderRadius: radius.md, padding: 16, alignItems: 'center' },
  submitBtnText: { color: 'white', fontSize: 15, fontWeight: '600' },
})
