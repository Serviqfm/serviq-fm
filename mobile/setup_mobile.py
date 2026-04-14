import os

# Create folder structure
folders = [
    'src/lib',
    'src/context',
    'src/screens',
    'src/components',
    'src/navigation',
    'src/i18n',
]
for folder in folders:
    os.makedirs(folder, exist_ok=True)
print('Folders created')

# ── 1. Supabase client ──
with open('src/lib/supabase.ts', 'w', encoding='utf-8') as f:
    f.write("""import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://cnpsplprnnabhrjjeqwp.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNucHNwbHByb25hYmhyamplcXdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQwOTI0ODEsImV4cCI6MjA1OTY2ODQ4MX0.aqKZxoiMBbqjBUQ-p1mNY6j4XFqvnCJyKzaWXJPYnCM'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})""")
print('Supabase client created')

# ── 2. i18n translations ──
with open('src/i18n/index.ts', 'w', encoding='utf-8') as f:
    f.write("""import { I18n } from 'i18n-js'
import AsyncStorage from '@react-native-async-storage/async-storage'

const translations = {
  en: {
    // Auth
    welcome: 'Welcome to Serviq FM',
    sign_in: 'Sign In',
    email: 'Email',
    password: 'Password',
    signing_in: 'Signing in...',
    // Navigation
    home: 'Home',
    work_orders: 'Work Orders',
    assets: 'Assets',
    profile: 'Profile',
    // Home
    good_morning: 'Good morning',
    good_afternoon: 'Good afternoon',
    good_evening: 'Good evening',
    my_work_orders: 'My Work Orders',
    overdue: 'Overdue',
    due_today: 'Due Today',
    open: 'Open',
    scan_qr: 'Scan QR',
    new_request: 'New Request',
    // Work Orders
    all: 'All',
    new: 'New',
    assigned: 'Assigned',
    in_progress: 'In Progress',
    on_hold: 'On Hold',
    completed: 'Completed',
    closed: 'Closed',
    unassigned: 'Unassigned',
    no_work_orders: 'No work orders',
    // Priority
    critical: 'Critical',
    high: 'High',
    medium: 'Medium',
    low: 'Low',
    // Actions
    start_work: 'Start Work',
    complete: 'Complete',
    put_on_hold: 'Put On Hold',
    add_comment: 'Add Comment',
    take_photo: 'Take Photo',
    upload_photo: 'Upload Photo',
    save: 'Save',
    cancel: 'Cancel',
    back: 'Back',
    loading: 'Loading...',
    // Details
    asset: 'Asset',
    site: 'Site',
    priority: 'Priority',
    status: 'Status',
    due_date: 'Due Date',
    assigned_to: 'Assigned To',
    description: 'Description',
    comments: 'Comments',
    photos: 'Photos',
    // Profile
    sign_out: 'Sign Out',
    language: 'Language',
    role: 'Role',
    organisation: 'Organisation',
    // Offline
    offline: 'You are offline',
    syncing: 'Syncing...',
    synced: 'Synced',
  },
  ar: {
    // Auth
    welcome: 'مرحباً بك في Serviq FM',
    sign_in: 'تسجيل الدخول',
    email: 'البريد الإلكتروني',
    password: 'كلمة المرور',
    signing_in: 'جاري تسجيل الدخول...',
    // Navigation
    home: 'الرئيسية',
    work_orders: 'أوامر العمل',
    assets: 'الأصول',
    profile: 'الملف الشخصي',
    // Home
    good_morning: 'صباح الخير',
    good_afternoon: 'مساء الخير',
    good_evening: 'مساء النور',
    my_work_orders: 'أوامر عملي',
    overdue: 'متأخر',
    due_today: 'مستحق اليوم',
    open: 'مفتوح',
    scan_qr: 'مسح QR',
    new_request: 'طلب جديد',
    // Work Orders
    all: 'الكل',
    new: 'جديد',
    assigned: 'مُعيَّن',
    in_progress: 'قيد التنفيذ',
    on_hold: 'معلق',
    completed: 'مكتمل',
    closed: 'مغلق',
    unassigned: 'غير مُعيَّن',
    no_work_orders: 'لا توجد أوامر عمل',
    // Priority
    critical: 'حرج',
    high: 'عالي',
    medium: 'متوسط',
    low: 'منخفض',
    // Actions
    start_work: 'بدء العمل',
    complete: 'إتمام',
    put_on_hold: 'تعليق',
    add_comment: 'إضافة تعليق',
    take_photo: 'التقاط صورة',
    upload_photo: 'رفع صورة',
    save: 'حفظ',
    cancel: 'إلغاء',
    back: 'رجوع',
    loading: 'جاري التحميل...',
    // Details
    asset: 'الأصل',
    site: 'الموقع',
    priority: 'الأولوية',
    status: 'الحالة',
    due_date: 'تاريخ الاستحقاق',
    assigned_to: 'مُعيَّن إلى',
    description: 'الوصف',
    comments: 'التعليقات',
    photos: 'الصور',
    // Profile
    sign_out: 'تسجيل الخروج',
    language: 'اللغة',
    role: 'الدور',
    organisation: 'المؤسسة',
    // Offline
    offline: 'أنت غير متصل بالإنترنت',
    syncing: 'جاري المزامنة...',
    synced: 'تمت المزامنة',
  },
}

export const i18n = new I18n(translations)
i18n.defaultLocale = 'en'
i18n.locale = 'en'
i18n.enableFallback = true

export async function loadLocale() {
  try {
    const saved = await AsyncStorage.getItem('serviq_lang')
    if (saved === 'ar' || saved === 'en') {
      i18n.locale = saved
    }
  } catch {}
}

export function setLocale(lang: 'ar' | 'en') {
  i18n.locale = lang
  AsyncStorage.setItem('serviq_lang', lang)
}

export function t(key: string) {
  return i18n.t(key)
}""")
print('i18n created')

# ── 3. Auth Context ──
with open('src/context/AuthContext.tsx', 'w', encoding='utf-8') as f:
    f.write("""import React, { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type AuthContextType = {
  user: any | null
  profile: any | null
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null, profile: null, loading: true, signOut: async () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else { setProfile(null); setLoading(false) }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId: string) {
    const { data } = await supabase
      .from('users')
      .select('*, organisation:organisation_id(name, plan_tier, vertical)')
      .eq('id', userId)
      .single()
    setProfile(data)
    setLoading(false)
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)""")
print('AuthContext created')

# ── 4. Lang Context ──
with open('src/context/LangContext.tsx', 'w', encoding='utf-8') as f:
    f.write("""import React, { createContext, useContext, useEffect, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { i18n, setLocale } from '../i18n'

type LangContextType = {
  lang: 'ar' | 'en'
  isRTL: boolean
  setLang: (lang: 'ar' | 'en') => void
  t: (key: string) => string
}

const LangContext = createContext<LangContextType>({
  lang: 'en', isRTL: false, setLang: () => {}, t: (k) => k,
})

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<'ar' | 'en'>('en')

  useEffect(() => {
    AsyncStorage.getItem('serviq_lang').then(saved => {
      if (saved === 'ar' || saved === 'en') {
        setLangState(saved)
        setLocale(saved)
      }
    })
  }, [])

  function setLang(l: 'ar' | 'en') {
    setLangState(l)
    setLocale(l)
  }

  function t(key: string) {
    return i18n.t(key)
  }

  return (
    <LangContext.Provider value={{ lang, isRTL: lang === 'ar', setLang, t }}>
      {children}
    </LangContext.Provider>
  )
}

export const useLang = () => useContext(LangContext)""")
print('LangContext created')

# ── 5. Colors & Theme ──
with open('src/lib/theme.ts', 'w', encoding='utf-8') as f:
    f.write("""export const colors = {
  primary: '#1a1a2e',
  primaryLight: '#16213e',
  accent: '#0f3460',
  white: '#ffffff',
  background: '#f8f9fa',
  card: '#ffffff',
  border: '#e9ecef',
  text: '#212529',
  textSecondary: '#6c757d',
  textLight: '#adb5bd',
  success: '#2e7d32',
  successLight: '#e8f5e9',
  warning: '#f57f17',
  warningLight: '#fff8e1',
  error: '#c62828',
  errorLight: '#fce4ec',
  info: '#0d47a1',
  infoLight: '#e3f2fd',

  priority: {
    critical: { bg: '#fce4ec', text: '#c62828' },
    high:     { bg: '#fff3e0', text: '#e65100' },
    medium:   { bg: '#fff8e1', text: '#f57f17' },
    low:      { bg: '#e8f5e9', text: '#2e7d32' },
  },

  status: {
    new:         { bg: '#e3f2fd', text: '#0d47a1' },
    assigned:    { bg: '#e8eaf6', text: '#283593' },
    in_progress: { bg: '#fff8e1', text: '#f57f17' },
    on_hold:     { bg: '#fce4ec', text: '#880e4f' },
    completed:   { bg: '#e8f5e9', text: '#1b5e20' },
    closed:      { bg: '#f5f5f5', text: '#424242' },
  },
}

export const fonts = {
  regular: { fontWeight: '400' as const },
  medium:  { fontWeight: '500' as const },
  semibold: { fontWeight: '600' as const },
  bold:    { fontWeight: '700' as const },
}

export const radius = {
  sm: 8, md: 12, lg: 16, xl: 20, full: 999,
}

export const shadow = {
  sm: {
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  md: {
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 8, elevation: 4,
  },
}""")
print('Theme created')

print('\\nAll base files created successfully')