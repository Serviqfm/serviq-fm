import React, { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, Switch, TextInput } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LangContext'
import { colors, radius, shadow } from '../lib/theme'

export default function ProfileScreen() {
  const { profile, signOut } = useAuth()
  const { t, lang, setLang, isRTL } = useLang()
  // 1C-01: native in-app change password. Re-auth with current password
  // (signInWithPassword) then updateUser. Same policy as web: min 8 + confirm match.
  const [curPw, setCurPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwSaving, setPwSaving] = useState(false)

  async function handleChangePassword() {
    if (newPw.length < 8) {
      Alert.alert(t('error'), lang === 'ar' ? 'يجب ألا تقل كلمة المرور عن 8 أحرف.' : 'Password must be at least 8 characters.')
      return
    }
    if (newPw !== confirmPw) {
      Alert.alert(t('error'), lang === 'ar' ? 'كلمتا المرور غير متطابقتين.' : 'Passwords do not match.')
      return
    }
    setPwSaving(true)
    const { error: authErr } = await supabase.auth.signInWithPassword({ email: profile?.email ?? '', password: curPw })
    if (authErr) {
      setPwSaving(false)
      Alert.alert(t('error'), lang === 'ar' ? 'كلمة المرور الحالية غير صحيحة.' : 'Current password is incorrect.')
      return
    }
    const { error: updErr } = await supabase.auth.updateUser({ password: newPw })
    setPwSaving(false)
    if (updErr) {
      Alert.alert(t('error'), updErr.message)
      return
    }
    setCurPw(''); setNewPw(''); setConfirmPw('')
    Alert.alert(lang === 'ar' ? 'تم' : 'Success', lang === 'ar' ? 'تم تحديث كلمة المرور.' : 'Password updated.')
  }
  // WO-33: local per-user auto-timer toggle (default ON), read by WO detail.
  const [autoTimer, setAutoTimer] = useState(true)
  useEffect(() => { AsyncStorage.getItem('pref:auto_timer').then(v => setAutoTimer(v !== '0')) }, [])
  function toggleAutoTimer(v: boolean) {
    setAutoTimer(v)
    AsyncStorage.setItem('pref:auto_timer', v ? '1' : '0')
  }

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

  async function handleDeleteAccount() {
    Alert.alert(
      lang === 'ar' ? 'حذف الحساب' : 'Delete Account',
      lang === 'ar'
        ? 'سيتم حذف حسابك نهائياً ولن تتمكن من تسجيل الدخول مرة أخرى. هل أنت متأكد؟'
        : 'Your account will be permanently deleted and you will no longer be able to sign in. Are you sure?',
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: lang === 'ar' ? 'حذف الحساب' : 'Delete Account',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.rpc('request_account_deletion')
            if (error) {
              Alert.alert(t('error'), error.message)
              return
            }
            await signOut()
          },
        },
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

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{lang === 'ar' ? 'التفضيلات' : 'Preferences'}</Text>
        <View style={[styles.row, { borderBottomWidth: 0 }]}>
          <Ionicons name='timer-outline' size={20} color={colors.textSecondary} />
          <View style={styles.rowContent}>
            <Text style={styles.rowValue}>{t('auto_timer')}</Text>
            <Text style={styles.rowLabel}>{t('auto_timer_desc')}</Text>
          </View>
          <Switch value={autoTimer} onValueChange={toggleAutoTimer}
            trackColor={{ true: colors.primary }} />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{lang === 'ar' ? 'تغيير كلمة المرور' : 'Change Password'}</Text>
        <TextInput style={[styles.input, { textAlign: isRTL ? 'right' : 'left' }]} secureTextEntry autoCapitalize='none'
          value={curPw} onChangeText={setCurPw} placeholderTextColor={colors.textSecondary}
          placeholder={lang === 'ar' ? 'كلمة المرور الحالية' : 'Current password'} />
        <TextInput style={[styles.input, { textAlign: isRTL ? 'right' : 'left' }]} secureTextEntry autoCapitalize='none'
          value={newPw} onChangeText={setNewPw} placeholderTextColor={colors.textSecondary}
          placeholder={lang === 'ar' ? 'كلمة مرور جديدة' : 'New password'} />
        <TextInput style={[styles.input, { textAlign: isRTL ? 'right' : 'left' }]} secureTextEntry autoCapitalize='none'
          value={confirmPw} onChangeText={setConfirmPw} placeholderTextColor={colors.textSecondary}
          placeholder={lang === 'ar' ? 'تأكيد كلمة المرور' : 'Confirm password'} />
        <TouchableOpacity style={[styles.pwBtn, pwSaving && { opacity: 0.7 }]} onPress={handleChangePassword} disabled={pwSaving}>
          <Text style={styles.pwBtnText}>
            {pwSaving ? (lang === 'ar' ? 'جارٍ الحفظ…' : 'Saving…') : (lang === 'ar' ? 'تحديث كلمة المرور' : 'Update Password')}
          </Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
        <Ionicons name='log-out-outline' size={20} color={colors.error} />
        <Text style={styles.signOutText}>{t('sign_out')}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.deleteBtn} onPress={handleDeleteAccount}>
        <Ionicons name='trash-outline' size={18} color={colors.textSecondary} />
        <Text style={styles.deleteText}>{lang === 'ar' ? 'حذف الحساب' : 'Delete Account'}</Text>
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
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colors.text, marginBottom: 10 },
  pwBtn: { backgroundColor: colors.primary, borderRadius: radius.sm, padding: 12, alignItems: 'center', marginTop: 2 },
  pwBtnText: { color: 'white', fontSize: 14, fontWeight: '600' },
  signOutBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, margin: 16, backgroundColor: 'white', borderRadius: radius.md, padding: 16, borderWidth: 1, borderColor: colors.errorLight, ...shadow.sm },
  signOutText: { fontSize: 15, color: colors.error, fontWeight: '500' },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginHorizontal: 16, marginTop: 4, marginBottom: 24, padding: 12 },
  deleteText: { fontSize: 14, color: colors.textSecondary, fontWeight: '500' },
})