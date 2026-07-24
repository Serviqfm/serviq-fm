import React, { useEffect, useLayoutEffect, useState } from 'react'
import {
  View, Text, SectionList, TouchableOpacity, StyleSheet, Modal,
  TextInput, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LangContext'
import { colors, radius, shadow } from '../lib/theme'

// AL-18: browse the org's sites and their spaces, and edit a space's basic
// fields (name, name_ar) under org RLS. Sites are section headers; spaces are
// the rows beneath them.
export default function LocationsScreen() {
  const navigation = useNavigation<any>()
  const { profile } = useAuth()
  const { t, lang } = useLang()
  const [sections, setSections] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<any | null>(null)
  const [name, setName] = useState('')
  const [nameAr, setNameAr] = useState('')
  const [saving, setSaving] = useState(false)

  useLayoutEffect(() => { navigation.setOptions({ title: t('locations') }) }, [navigation, t])

  useEffect(() => { load() }, [profile?.organisation_id])

  async function load() {
    if (!profile?.organisation_id) return
    setLoading(true)
    const [{ data: sites }, { data: spaces }] = await Promise.all([
      supabase.from('sites').select('id, name, name_ar')
        .eq('organisation_id', profile.organisation_id).order('name', { ascending: true }),
      supabase.from('spaces').select('id, name, name_ar, floor, site_id')
        .eq('organisation_id', profile.organisation_id).order('name', { ascending: true }),
    ])
    const secs = (sites ?? []).map(site => ({
      site,
      title: site.name,
      data: (spaces ?? []).filter(sp => sp.site_id === site.id),
    }))
    setSections(secs)
    setLoading(false)
  }

  function openEdit(space: any) {
    setEditing(space)
    setName(space.name ?? '')
    setNameAr(space.name_ar ?? '')
  }

  async function save() {
    if (!name.trim()) { Alert.alert(t('error'), t('name_required')); return }
    if (!profile?.organisation_id) { Alert.alert(t('error'), t('org_not_loaded')); return }
    setSaving(true)
    const { error } = await supabase.from('spaces')
      .update({ name: name.trim(), name_ar: nameAr.trim() ? nameAr.trim() : null })
      .eq('id', editing.id)
      .eq('organisation_id', profile.organisation_id)
    setSaving(false)
    if (error) { Alert.alert(t('error'), error.message); return }
    setEditing(null)
    load()
  }

  if (loading) return (
    <View style={styles.centered}><ActivityIndicator color={colors.primary} /></View>
  )

  return (
    <View style={styles.container}>
      <SectionList
        sections={sections}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Ionicons name='business-outline' size={16} color={colors.primary} />
            <Text style={styles.sectionTitle}>
              {lang === 'ar' && section.site.name_ar ? section.site.name_ar : section.title}
            </Text>
          </View>
        )}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.row} onPress={() => openEdit(item)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.spaceName}>
                {lang === 'ar' && item.name_ar ? item.name_ar : item.name}
              </Text>
              {item.floor ? <Text style={styles.spaceMeta}>{t('floor')}: {item.floor}</Text> : null}
            </View>
            <Ionicons name='create-outline' size={18} color={colors.textLight} />
          </TouchableOpacity>
        )}
        renderSectionFooter={({ section }) =>
          section.data.length === 0 ? <Text style={styles.emptySpaces}>—</Text> : null
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name='business-outline' size={48} color={colors.textLight} />
            <Text style={styles.emptyText}>{t('no_locations')}</Text>
          </View>
        }
      />

      <Modal transparent animationType='slide' visible={!!editing} onRequestClose={() => !saving && setEditing(null)}>
        <KeyboardAvoidingView
          style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>{t('edit_space')}</Text>
            <Text style={styles.fieldLabel}>{t('name')}</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder={t('name')}
              placeholderTextColor={colors.textLight}
            />
            <Text style={[styles.fieldLabel, { marginTop: 14 }]}>{t('name_ar')}</Text>
            <TextInput
              style={styles.input}
              value={nameAr}
              onChangeText={setNameAr}
              placeholder={t('name_ar')}
              placeholderTextColor={colors.textLight}
            />
            <View style={styles.sheetActions}>
              <TouchableOpacity style={[styles.sheetBtn, styles.sheetBtnGhost]} onPress={() => setEditing(null)} disabled={saving}>
                <Text style={styles.sheetBtnGhostText}>{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.sheetBtn, { backgroundColor: colors.primary }]} onPress={save} disabled={saving}>
                {saving ? <ActivityIndicator color='white' size='small' /> : <Text style={styles.sheetBtnText}>{t('save')}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 16, paddingTop: 8 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16, marginBottom: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: colors.primary, textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { backgroundColor: 'white', borderRadius: radius.md, padding: 14, marginBottom: 8, flexDirection: 'row', alignItems: 'center', ...shadow.sm },
  spaceName: { fontSize: 14, fontWeight: '600', color: colors.text },
  spaceMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  emptySpaces: { fontSize: 13, color: colors.textLight, paddingLeft: 4, paddingBottom: 4 },
  empty: { alignItems: 'center', padding: 48 },
  emptyText: { fontSize: 15, color: colors.textSecondary, marginTop: 12 },
  sheet: { backgroundColor: 'white', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32 },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: 12 },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: 16 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: 8 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: 12, fontSize: 14, color: colors.text },
  sheetActions: { flexDirection: 'row', gap: 12, marginTop: 20 },
  sheetBtn: { flex: 1, padding: 14, borderRadius: radius.sm, alignItems: 'center' },
  sheetBtnGhost: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  sheetBtnGhostText: { color: colors.textSecondary, fontSize: 15, fontWeight: '600' },
  sheetBtnText: { color: 'white', fontSize: 15, fontWeight: '600' },
})
