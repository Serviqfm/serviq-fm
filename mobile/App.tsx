import 'react-native-gesture-handler'
import React from 'react'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { View } from 'react-native'
import { AuthProvider } from './src/context/AuthContext'
import { LangProvider } from './src/context/LangContext'
import Navigation from './src/navigation'
import OfflineBanner from './src/components/OfflineBanner'

// DV-16 — global uncaught-error capture. Without this, JS errors outside a
// React render (async handlers, timers, native callbacks) fail silently.
// Console-based on purpose (no remote dep). A Sentry DSN would plug in here:
// import * as Sentry from '@sentry/react-native'; Sentry.captureException(err).
const prevHandler = ErrorUtils.getGlobalHandler()
ErrorUtils.setGlobalHandler((err: unknown, isFatal?: boolean) => {
  console.error('[uncaught]', isFatal ? '(fatal)' : '', err)
  prevHandler?.(err as Error, isFatal) // keep RN's red-box / crash behaviour
})

export default function App() {
  return (
    <SafeAreaProvider>
      <LangProvider>
        <AuthProvider>
          <StatusBar style='light' />
          <View style={{ flex: 1 }}>
            <Navigation />
            <OfflineBanner />
          </View>
        </AuthProvider>
      </LangProvider>
    </SafeAreaProvider>
  )
}