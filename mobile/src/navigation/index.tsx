import React from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { Ionicons } from '@expo/vector-icons'
import { ActivityIndicator, View } from 'react-native'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LangContext'
import { colors } from '../lib/theme'

import LoginScreen from '../screens/LoginScreen'
import HomeScreen from '../screens/HomeScreen'
import WorkOrdersScreen from '../screens/WorkOrdersScreen'
import WorkOrderDetailScreen from '../screens/WorkOrderDetailScreen'
import AssetsScreen from '../screens/AssetsScreen'
import ProfileScreen from '../screens/ProfileScreen'
import AssetDetailScreen from '../screens/AssetDetailScreen'

const Stack = createNativeStackNavigator()
const Tab = createBottomTabNavigator()

function TabNavigator() {
  const { t } = useLang()
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          const icons: Record<string, [string, string]> = {
            Home:       ['home',      'home-outline'],
            WorkOrders: ['clipboard', 'clipboard-outline'],
            Assets:     ['cube',      'cube-outline'],
            Profile:    ['person',    'person-outline'],
          }
          const [active, inactive] = icons[route.name] ?? ['circle', 'circle-outline']
          return <Ionicons name={(focused ? active : inactive) as any} size={size} color={color} />
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textLight,
        tabBarStyle: { paddingBottom: 8, height: 60 },
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: 'white',
        headerTitleStyle: { fontWeight: '600' },
      })}>
      <Tab.Screen name='Home' component={HomeScreen} options={{ title: t('home') }} />
      <Tab.Screen name='WorkOrders' component={WorkOrdersScreen} options={{ title: t('work_orders') }} />
      <Tab.Screen name='Assets' component={AssetsScreen} options={{ title: t('assets') }} />
      <Tab.Screen name='Profile' component={ProfileScreen} options={{ title: t('profile'), headerShown: false }} />
    </Tab.Navigator>
  )
}

function RootNavigator() {
  const { user, loading } = useAuth()

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
        </>
      ) : (
        <Stack.Screen name='Login' component={LoginScreen} />
      )}
    </Stack.Navigator>
  )
}

export default function Navigation() {
  return (
    <NavigationContainer>
      <RootNavigator />
    </NavigationContainer>
  )
}