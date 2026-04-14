import { I18n } from 'i18n-js'
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
}