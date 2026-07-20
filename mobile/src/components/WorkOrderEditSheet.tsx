import React, { useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, Alert, ActivityIndicator, Modal, KeyboardAvoidingView, Platform, Dimensions,
} from 'react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
import { Ionicons } from '@expo/vector-icons'
import { format } from 'date-fns'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LangContext'
import { colors, radius } from '../lib/theme'
import SelectField from './SelectField'

type Tech = { id: string; full_name: string }

// MKT-07: WO-detail edit sheet — title / priority / due (native date-time picker)
// + assign/reassign. Mirrors the web edit page's writable fields. Assignment
// changes are audited here (CORE-31); title/priority/due are not (matches web,
// whose PATCH route audits neither).
export default function WorkOrderEditSheet({
  wo, technicians, isManager, visible, onClose, onSaved,
}: {
  wo: any
  technicians: Tech[]
  isManager: boolean
  visible: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const { profile } = useAuth()
  const { t, lang } = useLang()
  const [title, setTitle] = useState<string>(wo.title ?? '')
  const [priority, setPriority] = useState<string>(wo.priority ?? 'medium')
  const [assignedTo, setAssignedTo] = useState<string | null>(wo.assigned_to ?? null)
  const [dueAt, setDueAt] = useState<Date | null>(wo.due_at ? new Date(wo.due_at) : null)
  const [pickerMode, setPickerMode] = useState<null | 'date' | 'time'>(null)
  const [saving, setSaving] = useState(false)

  const priorityOptions = [
    { key: 'low', label: t('low') },
    { key: 'medium', label: t('medium') },
    { key: 'high', label: t('high') },
    { key: 'critical', label: t('critical') },
  ]

  function openPicker() {
    if (!dueAt) {
      const d = new Date()
      d.setHours(17, 0, 0, 0)
      setDueAt(d)
    }
    // iOS shows a single inline datetime spinner (closed via Done); Android
    // opens a date dialog then a time dialog.
    setPickerMode('date')
  }

  function onPickerChange(event: any, selected?: Date) {
    if (Platform.OS === 'ios') {
      if (selected) setDueAt(selected) // iOS: live-update; Done closes it.
      return
    }
    // Android: one dialog per step, dismissable.
    if (event.type === 'dismissed') { setPickerMode(null); return }
    const picked = selected ?? dueAt ?? new Date()
    if (pickerMode === 'date') {
      setDueAt(picked)
      setPickerMode('time') // carry the day forward, now ask for the time
      return
    }
    setDueAt(picked)
    setPickerMode(null)
  }

  async function save() {
    if (!title.trim()) { Alert.alert(t('error'), t('title_required')); return }
    setSaving(true)
    const assigneeChanged = (assignedTo ?? null) !== (wo.assigned_to ?? null)
    const updates: any = {
      title: title.trim(),
      priority,
      due_at: dueAt ? dueAt.toISOString() : null,
      updated_at: new Date().toISOString(),
    }
    if (isManager) {
      updates.assigned_to = assignedTo ?? null
      // CORE-02/CORE-20: derive assigned/new from the assignment while still early.
      if (['new', 'assigned'].includes(wo.status)) {
        updates.status = assignedTo ? 'assigned' : 'new'
      }
    }
    const { error } = await supabase.from('work_orders').update(updates).eq('id', wo.id)
    if (error) { setSaving(false); Alert.alert(t('error'), error.message); return }

    // CORE-31: audit the assignment change (mirrors the web audit_logs shape).
    if (isManager && assigneeChanged) {
      const name = assignedTo ? (technicians.find(x => x.id === assignedTo)?.full_name ?? assignedTo) : null
      await supabase.from('audit_logs').insert({
        entity_type: 'work_order',
        entity_id: wo.id,
        action: name ? `Assigned to ${name}` : 'Unassigned',
        user_id: profile?.id,
        organisation_id: wo.organisation_id,
        new_values: { assigned_to: assignedTo ?? null },
        old_values: { assigned_to: wo.assigned_to ?? null },
        impersonated_by: null,
      })
    }
    setSaving(false)
    onSaved()
    onClose()
  }

  return (
    <Modal transparent animationType='slide' visible={visible} onRequestClose={() => !saving && onClose()}>
      <KeyboardAvoidingView
        style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>{lang === 'ar' ? 'تعديل أمر العمل' : 'Edit Work Order'}</Text>
          <ScrollView style={{ maxHeight: Dimensions.get('window').height * 0.6 }} keyboardShouldPersistTaps='handled'>
            <Text style={styles.fieldLabel}>{t('title')}</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder={t('title')}
              placeholderTextColor={colors.textLight}
            />

            <Text style={[styles.fieldLabel, { marginTop: 16 }]}>{t('priority')}</Text>
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

            {isManager && (
              <SelectField
                label={t('assigned_to')}
                placeholder={t('unassigned')}
                value={assignedTo}
                options={technicians.map(x => ({ value: x.id, label: x.full_name }))}
                onChange={setAssignedTo}
              />
            )}

            <Text style={[styles.fieldLabel, { marginTop: 16 }]}>{t('due_date')}</Text>
            <TouchableOpacity style={styles.input} onPress={openPicker}>
              <Text style={dueAt ? styles.valueText : styles.placeholderText}>
                {dueAt ? format(dueAt, 'dd MMM yyyy, HH:mm') : (lang === 'ar' ? 'حدد التاريخ والوقت' : 'Set date & time')}
              </Text>
              <Ionicons name='calendar-outline' size={18} color={colors.textLight} />
            </TouchableOpacity>
            {dueAt && (
              <TouchableOpacity onPress={() => setDueAt(null)}>
                <Text style={styles.clearDue}>{lang === 'ar' ? 'مسح تاريخ الاستحقاق' : 'Clear due date'}</Text>
              </TouchableOpacity>
            )}
            {pickerMode && (
              <DateTimePicker
                value={dueAt ?? new Date()}
                mode={Platform.OS === 'ios' ? 'datetime' : pickerMode}
                onChange={onPickerChange}
              />
            )}
            {pickerMode && Platform.OS === 'ios' && (
              <TouchableOpacity onPress={() => setPickerMode(null)}>
                <Text style={styles.doneDue}>{t('done')}</Text>
              </TouchableOpacity>
            )}
          </ScrollView>

          <View style={styles.sheetActions}>
            <TouchableOpacity style={[styles.sheetBtn, styles.sheetBtnGhost]} onPress={onClose} disabled={saving}>
              <Text style={styles.sheetBtnGhostText}>{t('cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.sheetBtn, { backgroundColor: colors.primary }]} onPress={save} disabled={saving}>
              {saving ? <ActivityIndicator color='white' size='small' /> : <Text style={styles.sheetBtnText}>{t('save')}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  sheet: { backgroundColor: 'white', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32 },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: 12 },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: 16 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: 8 },
  input: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: 12, fontSize: 14, color: colors.text,
  },
  valueText: { fontSize: 14, color: colors.text, flex: 1, marginRight: 8 },
  placeholderText: { fontSize: 14, color: colors.textLight, flex: 1, marginRight: 8 },
  clearDue: { fontSize: 12, color: colors.error, marginTop: 6 },
  doneDue: { fontSize: 14, color: colors.primary, fontWeight: '600', textAlign: 'right', marginTop: 8 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.full, backgroundColor: 'white', borderWidth: 1, borderColor: colors.border },
  pillText: { fontSize: 13, color: colors.textSecondary },
  sheetActions: { flexDirection: 'row', gap: 12, marginTop: 20 },
  sheetBtn: { flex: 1, padding: 14, borderRadius: radius.sm, alignItems: 'center' },
  sheetBtnGhost: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  sheetBtnGhostText: { color: colors.textSecondary, fontSize: 15, fontWeight: '600' },
  sheetBtnText: { color: 'white', fontSize: 15, fontWeight: '600' },
})
