import React, { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert, Image,
} from 'react-native'
import { supabase } from '../lib/supabase'
import { useLang } from '../context/LangContext'
import { colors, radius, shadow } from '../lib/theme'

export default function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const { t, lang, setLang, isRTL } = useLang()

  async function handleLogin() {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter email and password')
      return
    }
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) Alert.alert('Login Failed', error.message)
    setLoading(false)
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.inner}>
        <View style={styles.logoContainer}>
          <View style={styles.logoBox}>
            <Text style={styles.logoText}>S</Text>
          </View>
          <Text style={styles.appName}>Serviq FM</Text>
          <Text style={styles.tagline}>{lang === 'ar' ? 'إدارة المنشآت بذكاء' : 'Facility Management Platform'}</Text>
        </View>

        <View style={styles.card}>
          <Text style={[styles.title, isRTL && styles.rtl]}>{t('sign_in')}</Text>

          <View style={styles.field}>
            <Text style={[styles.label, isRTL && styles.rtl]}>{t('email')}</Text>
            <TextInput
              style={[styles.input, isRTL && styles.inputRTL]}
              value={email}
              onChangeText={setEmail}
              placeholder='name@company.com'
              placeholderTextColor={colors.textLight}
              autoCapitalize='none'
              keyboardType='email-address'
              textAlign={isRTL ? 'right' : 'left'}
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, isRTL && styles.rtl]}>{t('password')}</Text>
            <TextInput
              style={[styles.input, isRTL && styles.inputRTL]}
              value={password}
              onChangeText={setPassword}
              placeholder='••••••••'
              placeholderTextColor={colors.textLight}
              secureTextEntry
              textAlign={isRTL ? 'right' : 'left'}
            />
          </View>

          <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
            {loading
              ? <ActivityIndicator color='white' />
              : <Text style={styles.buttonText}>{t('sign_in')}</Text>
            }
          </TouchableOpacity>
        </View>

        <View style={styles.langRow}>
          {(['en', 'ar'] as const).map(l => (
            <TouchableOpacity key={l} onPress={() => setLang(l)}
              style={[styles.langBtn, lang === l && styles.langBtnActive]}>
              <Text style={[styles.langBtnText, lang === l && styles.langBtnTextActive]}>
                {l === 'ar' ? 'العربية' : 'English'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  inner: { flex: 1, justifyContent: 'center', padding: 24 },
  logoContainer: { alignItems: 'center', marginBottom: 32 },
  logoBox: { width: 72, height: 72, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  logoText: { color: 'white', fontSize: 32, fontWeight: '700' },
  appName: { fontSize: 24, fontWeight: '700', color: colors.text, marginBottom: 4 },
  tagline: { fontSize: 14, color: colors.textSecondary },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 24, ...shadow.md, marginBottom: 24 },
  title: { fontSize: 20, fontWeight: '600', color: colors.text, marginBottom: 20 },
  field: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '500', color: colors.textSecondary, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: 12, fontSize: 15, color: colors.text, backgroundColor: '#fafafa' },
  inputRTL: { textAlign: 'right' },
  button: { backgroundColor: colors.primary, borderRadius: radius.sm, padding: 14, alignItems: 'center', marginTop: 8 },
  buttonText: { color: 'white', fontSize: 16, fontWeight: '600' },
  rtl: { textAlign: 'right' },
  langRow: { flexDirection: 'row', justifyContent: 'center', gap: 12 },
  langBtn: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border, backgroundColor: 'white' },
  langBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  langBtnText: { fontSize: 14, color: colors.textSecondary },
  langBtnTextActive: { color: 'white', fontWeight: '600' },
})