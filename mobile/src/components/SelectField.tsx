import React, { useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Modal, FlatList } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useLang } from '../context/LangContext'
import { colors, radius } from '../lib/theme'

export type SelectOption = { value: string; label: string }

type Props = {
  label: string
  placeholder: string
  value: string | null
  options: SelectOption[]
  onChange: (value: string | null) => void
  allowNone?: boolean
}

export default function SelectField({ label, placeholder, value, options, onChange, allowNone = true }: Props) {
  const { t } = useLang()
  const [open, setOpen] = useState(false)
  const selected = options.find(o => o.value === value)

  function select(v: string | null) {
    onChange(v)
    setOpen(false)
  }

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity style={styles.input} onPress={() => setOpen(true)}>
        <Text style={selected ? styles.valueText : styles.placeholderText} numberOfLines={1}>
          {selected?.label ?? placeholder}
        </Text>
        <Ionicons name='chevron-down' size={16} color={colors.textLight} />
      </TouchableOpacity>

      <Modal transparent animationType='fade' visible={open} onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setOpen(false)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{label}</Text>
            <FlatList
              data={allowNone ? [{ value: '', label: t('none') }, ...options] : options}
              keyExtractor={item => item.value || '__none__'}
              renderItem={({ item }) => {
                const isSelected = item.value === '' ? !value : item.value === value
                return (
                  <TouchableOpacity style={styles.option} onPress={() => select(item.value === '' ? null : item.value)}>
                    <Text style={[styles.optionText, isSelected && styles.optionTextSelected]} numberOfLines={1}>
                      {item.label}
                    </Text>
                    {isSelected && <Ionicons name='checkmark' size={18} color={colors.primary} />}
                  </TouchableOpacity>
                )
              }}
              style={{ maxHeight: 360 }}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  field: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: 6 },
  input: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'white', borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 12,
  },
  valueText: { fontSize: 14, color: colors.text, flex: 1, marginRight: 8 },
  placeholderText: { fontSize: 14, color: colors.textLight, flex: 1, marginRight: 8 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 },
  sheet: { backgroundColor: 'white', borderRadius: radius.md, padding: 16, maxHeight: 440 },
  sheetTitle: { fontSize: 14, fontWeight: '600', color: colors.textSecondary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  option: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  optionText: { fontSize: 14, color: colors.text, flex: 1, marginRight: 8 },
  optionTextSelected: { color: colors.primary, fontWeight: '600' },
})
