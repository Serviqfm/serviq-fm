import React, { useEffect, useLayoutEffect, useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
import { Ionicons } from '@expo/vector-icons'
import { format } from 'date-fns'
import { useNavigation, useRoute } from '@react-navigation/native'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LangContext'
import { colors, radius, shadow } from '../lib/theme'
import { CATEGORIES } from '../lib/categories'
import SelectField from '../components/SelectField'

// AL-22: full MEP asset field coverage — mirrors the web edit form
// (web/src/app/dashboard/assets/[id]/edit). Handles both create (no params)
// and edit (route.params.asset = existing row).
export default function CreateAssetScreen() {
  const navigation = useNavigation<any>()
  const route = useRoute<any>()
  const { profile } = useAuth()
  const { t } = useLang()

  const editing: any | null = route.params?.asset ?? null

  const [name, setName] = useState(editing?.name ?? '')
  const [nameAr, setNameAr] = useState(editing?.name_ar ?? '')
  const [category, setCategory] = useState<string | null>(editing?.category ?? null)
  const [criticality, setCriticality] = useState<string | null>(editing?.criticality ?? null)
  const [siteId, setSiteId] = useState<string | null>(editing?.site_id ?? null)
  const [spaceId, setSpaceId] = useState<string | null>(editing?.space_id ?? null)
  const [subLocation, setSubLocation] = useState(editing?.sub_location ?? '')
  const [serialNumber, setSerialNumber] = useState(editing?.serial_number ?? '')
  const [manufacturer, setManufacturer] = useState(editing?.manufacturer ?? '')
  const [model, setModel] = useState(editing?.model ?? '')
  const [warranty, setWarranty] = useState<Date | null>(editing?.warranty_expiry ? new Date(editing.warranty_expiry) : null)
  const [showWarrantyPicker, setShowWarrantyPicker] = useState(false)
  const [status, setStatus] = useState<string>(editing?.status ?? 'active')
  const [description, setDescription] = useState(editing?.description ?? '')
  const [sites, setSites] = useState<any[]>([])
  const [spaces, setSpaces] = useState<any[]>([])
  const [saving, setSaving] = useState(false)

  useLayoutEffect(() => {
    navigation.setOptions({ title: editing ? t('edit_asset') : t('create_asset') })
  }, [navigation, t, editing])

  useEffect(() => { fetchLocations() }, [profile?.id])

  async function fetchLocations() {
    if (!profile?.organisation_id) return
    const [{ data: siteData }, { data: spaceData }] = await Promise.all([
      supabase.from('sites').select('id, name')
        .eq('organisation_id', profile.organisation_id).order('name', { ascending: true }),
      supabase.from('spaces').select('id, name, site_id')
        .eq('organisation_id', profile.organisation_id).order('name', { ascending: true }),
    ])
    if (siteData) setSites(siteData)
    if (spaceData) setSpaces(spaceData)
  }

  // AL-21 parity: changing the site clears a space that belongs to another site.
  function onSiteChange(v: string | null) {
    setSiteId(v)
    if (spaceId && spaces.find(s => s.id === spaceId)?.site_id !== v) setSpaceId(null)
  }

  function onWarrantyChange(event: any, selected?: Date) {
    if (Platform.OS !== 'ios') setShowWarrantyPicker(false)
    if (event.type === 'dismissed') return
    if (selected) setWarranty(selected)
  }

  async function save() {
    if (!name.trim()) { Alert.alert(t('error'), t('name_required')); return }
    if (!profile?.organisation_id) { Alert.alert(t('error'), t('org_not_loaded')); return }
    setSaving(true)

    const fields = {
      name: name.trim(),
      name_ar: nameAr.trim() ? nameAr.trim() : null,
      category,
      criticality,
      site_id: siteId,
      space_id: spaceId,
      sub_location: subLocation.trim() ? subLocation.trim() : null,
      serial_number: serialNumber.trim() ? serialNumber.trim() : null,
      manufacturer: manufacturer.trim() ? manufacturer.trim() : null,
      model: model.trim() ? model.trim() : null,
      warranty_expiry: warranty ? format(warranty, 'yyyy-MM-dd') : null,
      status,
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
        qr_code: qrCode,
      })
      error = res.error
    }

    setSaving(false)
    if (error) { Alert.alert(t('error'), error.message || t('create_failed')); return }
    Alert.alert(t('done'), editing ? t('asset_updated') : t('asset_created'))
    navigation.goBack()
  }

  const textFields: { label: string; value: string; onChange: (v: string) => void }[] = [
    { label: t('sub_location'), value: subLocation, onChange: setSubLocation },
    { label: t('serial_number'), value: serialNumber, onChange: setSerialNumber },
    { label: t('manufacturer'), value: manufacturer, onChange: setManufacturer },
    { label: t('model'), value: model, onChange: setModel },
  ]

  const spaceOptions = spaces.filter(s => s.site_id === siteId)

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
            label={t('criticality')}
            placeholder={t('select_criticality')}
            value={criticality}
            options={[
              { value: 'low', label: t('low') },
              { value: 'medium', label: t('medium') },
              { value: 'high', label: t('high') },
              { value: 'critical', label: t('critical') },
            ]}
            onChange={setCriticality}
          />

          <SelectField
            label={t('site')}
            placeholder={t('select_site')}
            value={siteId}
            options={sites.map(s => ({ value: s.id, label: s.name }))}
            onChange={onSiteChange}
          />

          {siteId && spaceOptions.length > 0 && (
            <SelectField
              label={t('space')}
              placeholder={t('select_space')}
              value={spaceId}
              options={spaceOptions.map(s => ({ value: s.id, label: s.name }))}
              onChange={setSpaceId}
            />
          )}

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
            <Text style={styles.label}>{t('warranty_expiry')}</Text>
            <TouchableOpacity style={styles.dateInput} onPress={() => setShowWarrantyPicker(true)}>
              <Text style={{ fontSize: 14, color: warranty ? colors.text : colors.textLight }}>
                {warranty ? format(warranty, 'dd MMM yyyy') : t('select_date')}
              </Text>
              <Ionicons name='calendar-outline' size={18} color={colors.textLight} />
            </TouchableOpacity>
            {warranty && (
              <TouchableOpacity onPress={() => setWarranty(null)}>
                <Text style={styles.clearText}>{t('clear')}</Text>
              </TouchableOpacity>
            )}
            {showWarrantyPicker && (
              <DateTimePicker value={warranty ?? new Date()} mode='date' onChange={onWarrantyChange} />
            )}
            {showWarrantyPicker && Platform.OS === 'ios' && (
              <TouchableOpacity onPress={() => setShowWarrantyPicker(false)}>
                <Text style={styles.doneText}>{t('done')}</Text>
              </TouchableOpacity>
            )}
          </View>

          <SelectField
            label={t('status')}
            placeholder={t('select_status')}
            value={status}
            allowNone={false}
            options={[
              { value: 'active', label: t('active') },
              { value: 'under_maintenance', label: t('under_maintenance') },
              { value: 'retired', label: t('retired') },
            ]}
            onChange={v => setStatus(v ?? 'active')}
          />

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
  dateInput: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'white', borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 12 },
  clearText: { fontSize: 12, color: colors.error, marginTop: 6 },
  doneText: { fontSize: 14, color: colors.primary, fontWeight: '600', textAlign: 'right', marginTop: 8 },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  submitBtn: { marginTop: 16, backgroundColor: colors.primary, borderRadius: radius.md, padding: 16, alignItems: 'center' },
  submitBtnText: { color: 'white', fontSize: 15, fontWeight: '600' },
})
