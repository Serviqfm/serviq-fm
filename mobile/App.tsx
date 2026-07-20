import 'react-native-gesture-handler'
import React, { useEffect } from 'react'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { View } from 'react-native'
import * as Notifications from 'expo-notifications'
import { AuthProvider } from './src/context/AuthContext'
import { LangProvider } from './src/context/LangContext'
import Navigation, { routeToWorkOrder } from './src/navigation'
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

// CORE-06 — tapping a work-order push opens its detail screen. The web /api/push
// sends { woId, woNumber } in the notification data payload.
function routeFromNotification(data: any) {
  const woId = data?.woId
  if (typeof woId === 'string' && woId) routeToWorkOrder(woId)
}

export default function App() {
  useEffect(() => {
    // Warm tap (app running / backgrounded).
    const sub = Notifications.addNotificationResponseReceivedListener(res => {
      routeFromNotification(res.notification.request.content.data)
    })
    // Cold start — the tap that launched the app.
    Notifications.getLastNotificationResponseAsync().then(res => {
      if (res) routeFromNotification(res.notification.request.content.data)
    })
    return () => sub.remove()
  }, [])

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