import React, { useEffect, useState } from 'react'
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { Ionicons } from '@expo/vector-icons'
import { ActivityIndicator, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LangContext'
import { colors } from '../lib/theme'

import LoginScreen from '../screens/LoginScreen'
import HomeScreen from '../screens/HomeScreen'
import WorkOrdersScreen from '../screens/WorkOrdersScreen'
import WorkOrderDetailScreen from '../screens/WorkOrderDetailScreen'
import AssetsScreen from '../screens/AssetsScreen'
import AssetLogScreen from '../screens/AssetLogScreen'
import ProfileScreen from '../screens/ProfileScreen'
import NotificationsScreen from '../screens/NotificationsScreen'
import AssetDetailScreen from '../screens/AssetDetailScreen'
import AssetLogDetailScreen from '../screens/AssetLogDetailScreen'
import QRScannerScreen from '../screens/QRScannerScreen'
import CreateWorkOrderScreen from '../screens/CreateWorkOrderScreen'
import CreateAssetScreen from '../screens/CreateAssetScreen'
import RunInspectionScreen from '../screens/RunInspectionScreen'

const Stack = createNativeStackNavigator()
const Tab = createBottomTabNavigator()

// CORE-06 — imperative deep-link target for notification taps. A push tap can
// arrive before the app (or the authed stack) is mounted, so we hold the pending
// work-order id and flush it once both nav is ready and the user is signed in.
export const navigationRef = createNavigationContainerRef()
let pendingWoId: string | null = null
let authed = false

function flushPendingNav() {
  if (pendingWoId && authed && navigationRef.isReady()) {
    const id = pendingWoId
    pendingWoId = null
    ;(navigationRef.navigate as any)('WorkOrderDetail', { id })
  }
}

export function routeToWorkOrder(woId: string) {
  pendingWoId = woId
  flushPendingNav()
}

function setAuthedForNav(v: boolean) {
  authed = v
  flushPendingNav()
}

// Unread notification count for the tab badge. Poll-based (like the web bell) —
// a badge doesn't need realtime. ponytail: 30s poll, swap to realtime if it matters.
function useUnreadCount(userId: string | undefined) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (!userId) { setCount(0); return }
    let alive = true
    async function load() {
      const { count: c } = await supabase
        .from('user_notifications')
        .select('id', { count: 'exact', head: true })
        .is('read_at', null)
      if (alive) setCount(c ?? 0)
    }
    load()
    const t = setInterval(load, 30_000)
    return () => { alive = false; clearInterval(t) }
  }, [userId])
  return count
}

function TabNavigator() {
  const { t } = useLang()
  const { profile } = useAuth()
  const insets = useSafeAreaInsets()
  const unread = useUnreadCount(profile?.id)
  const isRequester = profile?.role === 'requester'

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          const icons: Record<string, [string, string]> = {
            Home:          ['home',          'home-outline'],
            WorkOrders:    ['clipboard',     'clipboard-outline'],
            Assets:        ['cube',          'cube-outline'],
            Notifications: ['notifications', 'notifications-outline'],
            Profile:       ['person',        'person-outline'],
          }
          const [active, inactive] = icons[route.name] ?? ['ellipse', 'ellipse-outline']
          return <Ionicons name={(focused ? active : inactive) as any} size={size} color={color} />
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textLight,
        tabBarStyle: {
          paddingBottom: 8 + insets.bottom,
          height: 60 + insets.bottom,
        },
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: 'white',
        headerTitleStyle: { fontWeight: '600' },
      })}>
      <Tab.Screen name='Home' component={HomeScreen} options={{ title: t('home') }} />
      {/* CORE-19: requesters see only their own requests, never the org-wide WO list. */}
      <Tab.Screen name='WorkOrders' component={WorkOrdersScreen}
        options={{ title: isRequester ? t('my_requests') : t('work_orders') }} />
      {/* CORE-19: no org-wide asset browsing for requesters. */}
      {!isRequester && (
        <Tab.Screen name='Assets' component={AssetsScreen} options={{ title: t('assets') }} />
      )}
      <Tab.Screen name='Notifications' component={NotificationsScreen}
        options={{ title: t('notifications'), tabBarBadge: unread > 0 ? (unread > 99 ? '99+' : unread) : undefined }} />
      <Tab.Screen name='Profile' component={ProfileScreen} options={{ title: t('profile'), headerShown: false }} />
    </Tab.Navigator>
  )
}

function RootNavigator() {
  const { user, loading } = useAuth()

  useEffect(() => { setAuthedForNav(!!user) }, [user])

  if (loading) return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator size='large' color={colors.primary} />
    </View>
  )

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {user ? (
        <>
          <Stack.Screen name='Main' component={TabNavigator} />
          <Stack.Screen name='WorkOrderDetail' component={WorkOrderDetailScreen}
            options={{ headerShown: true, title: 'Work Order', headerStyle: { backgroundColor: colors.primary }, headerTintColor: 'white' }} />
          <Stack.Screen name='AssetDetail' component={AssetDetailScreen}
            options={{ headerShown: true, title: 'Asset', headerStyle: { backgroundColor: colors.primary }, headerTintColor: 'white' }} />
          <Stack.Screen name='AssetLog' component={AssetLogScreen}
            options={{ headerShown: true, title: 'Asset Log', headerStyle: { backgroundColor: colors.primary }, headerTintColor: 'white' }} />
          <Stack.Screen name='AssetLogDetail' component={AssetLogDetailScreen}
            options={{ headerShown: true, title: 'Asset Log Item', headerStyle: { backgroundColor: colors.primary }, headerTintColor: 'white' }} />
          <Stack.Screen name='CreateWorkOrder' component={CreateWorkOrderScreen}
            options={{ headerShown: true, title: 'Create Work Order', headerStyle: { backgroundColor: colors.primary }, headerTintColor: 'white' }} />
          <Stack.Screen name='AssetForm' component={CreateAssetScreen}
            options={{ headerShown: true, title: 'Asset', headerStyle: { backgroundColor: colors.primary }, headerTintColor: 'white' }} />
          <Stack.Screen name='RunInspection' component={RunInspectionScreen}
            options={{ headerShown: true, title: 'Inspection', headerStyle: { backgroundColor: colors.primary }, headerTintColor: 'white' }} />
          <Stack.Screen
            name='QRScanner'
            component={QRScannerScreen}
            options={{
              headerShown: true,
              title: 'Scan QR Code',
              headerStyle: { backgroundColor: colors.primary },
              headerTintColor: 'white',
              presentation: 'modal',
            }}
          />
        </>
      ) : (
        <Stack.Screen name='Login' component={LoginScreen} />
      )}
    </Stack.Navigator>
  )
}

export default function Navigation() {
  return (
    <NavigationContainer ref={navigationRef} onReady={flushPendingNav}>
      <RootNavigator />
    </NavigationContainer>
  )
}
