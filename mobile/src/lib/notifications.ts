import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { supabase } from './supabase'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
})

export async function registerPushToken(userId: string): Promise<void> {
  const { status: existing } = await Notifications.getPermissionsAsync()
  let finalStatus = existing

  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync()
    finalStatus = status
  }

  if (finalStatus !== 'granted') {
    console.warn('Push notification permission not granted')
    return
  }

  const projectId = process.env.EXPO_PUBLIC_PROJECT_ID
  if (!projectId) {
    console.warn('EXPO_PUBLIC_PROJECT_ID is not set — push token registration skipped')
    return
  }

  const tokenData = await Notifications.getExpoPushTokenAsync({ projectId })

  const token = tokenData.data

  await supabase
    .from('users')
    .update({ push_token: token, push_platform: Platform.OS })
    .eq('id', userId)
}

export async function clearPushToken(userId: string): Promise<void> {
  await supabase
    .from('users')
    .update({ push_token: null, push_platform: null })
    .eq('id', userId)
}
