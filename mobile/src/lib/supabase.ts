import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as SecureStore from 'expo-secure-store'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://cnpsplprnnabhrjjeqwp.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNucHNwbHBybm5hYmhyamplcXdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MjM2NDQsImV4cCI6MjA5MTE5OTY0NH0.pttZiw9EgE2sE9qAmrw8ZrW22dUVoJZGofeOq9kWafc'

// SecureStore values are limited to 2048 bytes on some platforms, while a
// Supabase session JSON can easily exceed that. This adapter transparently
// splits large values into chunks stored under derived SecureStore keys.
// The chunk size is conservative (in UTF-16 code units) so that even
// multi-byte UTF-8 characters stay well under the 2048-byte limit.
const CHUNK_SIZE = 600

const chunkCountKey = (key: string) => `${key}__chunks`
const chunkKey = (key: string, index: number) => `${key}__chunk_${index}`

async function deleteChunks(key: string, from: number, count: number) {
  for (let i = from; i < count; i++) {
    await SecureStore.deleteItemAsync(chunkKey(key, i))
  }
}

const secureChunkedStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      const countStr = await SecureStore.getItemAsync(chunkCountKey(key))
      if (countStr) {
        const count = parseInt(countStr, 10)
        if (!count || count < 1) return null
        const parts: string[] = []
        for (let i = 0; i < count; i++) {
          const part = await SecureStore.getItemAsync(chunkKey(key, i))
          if (part === null) return null
          parts.push(part)
        }
        return parts.join('')
      }
      const plain = await SecureStore.getItemAsync(key)
      if (plain !== null) return plain
      // One-time migration: older builds persisted the session in plaintext
      // AsyncStorage. Move it into SecureStore so users stay signed in.
      const legacy = await AsyncStorage.getItem(key)
      if (legacy !== null) {
        await secureChunkedStorage.setItem(key, legacy)
        await AsyncStorage.removeItem(key)
      }
      return legacy
    } catch {
      return null
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    try {
      const prevCountStr = await SecureStore.getItemAsync(chunkCountKey(key))
      const prevCount = prevCountStr ? parseInt(prevCountStr, 10) || 0 : 0
      if (value.length <= CHUNK_SIZE) {
        await SecureStore.setItemAsync(key, value)
        await SecureStore.deleteItemAsync(chunkCountKey(key))
        await deleteChunks(key, 0, prevCount)
      } else {
        const chunks: string[] = []
        for (let i = 0; i < value.length; i += CHUNK_SIZE) {
          chunks.push(value.slice(i, i + CHUNK_SIZE))
        }
        for (let i = 0; i < chunks.length; i++) {
          await SecureStore.setItemAsync(chunkKey(key, i), chunks[i])
        }
        await SecureStore.setItemAsync(chunkCountKey(key), String(chunks.length))
        await SecureStore.deleteItemAsync(key)
        await deleteChunks(key, chunks.length, prevCount)
      }
    } catch {
      // Never let storage failures crash auth flows.
    }
  },
  async removeItem(key: string): Promise<void> {
    try {
      const countStr = await SecureStore.getItemAsync(chunkCountKey(key))
      const count = countStr ? parseInt(countStr, 10) || 0 : 0
      await SecureStore.deleteItemAsync(key)
      await SecureStore.deleteItemAsync(chunkCountKey(key))
      await deleteChunks(key, 0, count)
      // Clear any legacy plaintext copy as well.
      await AsyncStorage.removeItem(key)
    } catch {
      // Never let storage failures crash auth flows.
    }
  },
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: secureChunkedStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})
