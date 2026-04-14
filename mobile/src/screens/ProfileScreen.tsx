import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LangContext'
import { colors, radius, shadow } from '../lib/theme'

export default function ProfileScreen() {
  const { profile, signOut } = useAuth()
  const { t, lang, setLang, isRTL } = useLang()

  async function handleSignOut() {
    Alert.alert(
      lang === 'ar' ? 'تسجيل الخروج' : 'Sign Out',
      lang === 'ar' ? 'هل أنت متأكد؟' : 'Are you sure?',
      [
        { text: t('cancel'), style: 'cancel' },
        { text: t('sign_out'), style: 'destructive', onPress: signOut },
      ]
    )
  }

  const roleLabels: Record<string, string> = {
    admin: lang === 'ar' ? 'مشرف' : 'Admin',
    manager: lang === 'ar' ? 'مدير' : 'Manager',
    technician: lang === 'ar' ? 'فني' : 'Technician',
    requester: lang === 'ar' ? 'مقدم طلب' : 'Requester',
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{profile?.full_name?.[0]?.toUpperCase() ?? 'U'}</Text>
        </View>
        <Text style={styles.name}>{profile?.full_name}</Text>
        <Text style={styles.role}>{roleLabels[profile?.role] ?? profile?.role}</Text>
        <Text style={styles.org}>{profile?.organisation?.name}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{lang === 'ar' ? 'معلومات الحساب' : 'Account'}</Text>
        {[
          { icon: 'mail-outline', label: lang === 'ar' ? 'البريد الإلكتروني' : 'Email', value: profile?.email },
          { icon: 'shield-outline', label: t('role'), value: roleLabels[profile?.role] ?? profile?.role },
          { icon: 'business-outline', label: t('organisation'), value: profile?.organisation?.name },
        ].map(item => (
          <View key={item.label} style={styles.row}>
            <Ionicons name={item.icon as any} size={20} color={colors.textSecondary} />
            <View style={styles.rowContent}>
              <Text style={styles.rowLabel}>{item.label}</Text>
              <Text style={styles.rowValue}>{item.value}</Text>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('language')}</Text>
        <View style={styles.langRow}>
          {(['en', 'ar'] as const).map(l => (
            <TouchableOpacity key={l} style={[styles.langBtn, lang === l && styles.langBtnActive]}
              onPress={() => setLang(l)}>
              <Text style={[styles.langBtnText, lang === l && styles.langBtnTextActive]}>
                {l === 'ar' ? 'العربية' : 'English'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
        <Ionicons name='log-out-outline' size={20} color={colors.error} />
        <Text style={styles.signOutText}>{t('sign_out')}</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { backgroundColor: colors.primary, padding: 32, paddingTop: 60, alignItems: 'center' },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  avatarText: { color: 'white', fontSize: 32, fontWeight: '700' },
  name: { color: 'white', fontSize: 20, fontWeight: '700', marginBottom: 4 },
  role: { color: 'rgba(255,255,255,0.7)', fontSize: 14, marginBottom: 4 },
  org: { color: 'rgba(255,255,255,0.5)', fontSize: 13 },
  section: { backgroundColor: 'white', margin: 16, marginBottom: 0, borderRadius: radius.md, padding: 16, ...shadow.sm },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowContent: { flex: 1 },
  rowLabel: { fontSize: 12, color: colors.textSecondary, marginBottom: 2 },
  rowValue: { fontSize: 14, fontWeight: '500', color: colors.text },
  langRow: { flexDirection: 'row', gap: 12 },
  langBtn: { flex: 1, padding: 12, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  langBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  langBtnText: { fontSize: 14, color: colors.textSecondary },
  langBtnTextActive: { color: 'white', fontWeight: '600' },
  signOutBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, margin: 16, backgroundColor: 'white', borderRadius: radius.md, padding: 16, borderWidth: 1, borderColor: colors.errorLight, ...shadow.sm },
  signOutText: { fontSize: 15, color: colors.error, fontWeight: '500' },
})