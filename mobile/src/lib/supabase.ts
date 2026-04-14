import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://cnpsplprnnabhrjjeqwp.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNucHNwbHBybm5hYmhyamplcXdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MjM2NDQsImV4cCI6MjA5MTE5OTY0NH0.pttZiw9EgE2sE9qAmrw8ZrW22dUVoJZGofeOq9kWafc'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})