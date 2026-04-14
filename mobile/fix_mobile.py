# Fix 1: Add Assets screen placeholder + fix navigation
with open('src/screens/AssetsScreen.tsx', 'w', encoding='utf-8') as f:
    f.write("""import React, { useEffect, useState } from 'react'
import { View, Text, FlatList, TouchableOpacity, StyleSheet, TextInput, RefreshControl } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LangContext'
import { colors, radius, shadow } from '../lib/theme'

export default function AssetsScreen() {
  const { profile } = useAuth()
  const { t, lang } = useLang()
  const [assets, setAssets] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => { fetchAssets() }, [])

  async function fetchAssets() {
    if (!profile) return
    setLoading(true)
    const { data } = await supabase
      .from('assets')
      .select('*, site:site_id(name)')
      .eq('organisation_id', profile.organisation_id)
      .order('name', { ascending: true })
    if (data) setAssets(data)
    setLoading(false)
  }

  async function onRefresh() {
    setRefreshing(true)
    await fetchAssets()
    setRefreshing(false)
  }

  const filtered = assets.filter(a =>
    a.name?.toLowerCase().includes(search.toLowerCase()) ||
    a.category?.toLowerCase().includes(search.toLowerCase())
  )

  const statusColors: Record<string, { bg: string; text: string }> = {
    active: { bg: colors.successLight, text: colors.success },
    under_maintenance: { bg: colors.warningLight, text: colors.warning },
    retired: { bg: '#f5f5f5', text: colors.textSecondary },
  }

  function renderAsset({ item }: { item: any }) {
    const sc = statusColors[item.status] ?? statusColors.active
    const statusLabel: Record<string, string> = {
      active: lang === 'ar' ? 'نشط' : 'Active',
      under_maintenance: lang === 'ar' ? 'تحت الصيانة' : 'Under Maintenance',
      retired: lang === 'ar' ? 'متقاعد' : 'Retired',
    }
    return (
      <View style={styles.card}>
        <View style={styles.cardLeft}>
          <View style={styles.assetIcon}>
            <Ionicons name='cube-outline' size={20} color={colors.primary} />
          </View>
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.assetName} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.assetMeta}>{item.category ?? '-'} {item.site?.name ? '· ' + item.site.name : ''}</Text>
          {item.serial_number && <Text style={styles.assetSerial}>{item.serial_number}</Text>}
        </View>
        <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
          <Text style={[styles.statusText, { color: sc.text }]}>{statusLabel[item.status] ?? item.status}</Text>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <Ionicons name='search-outline' size={18} color={colors.textLight} style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder={lang === 'ar' ? 'البحث في الأصول...' : 'Search assets...'}
          placeholderTextColor={colors.textLight}
        />
      </View>
      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        renderItem={renderAsset}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name='cube-outline' size={48} color={colors.textLight} />
            <Text style={styles.emptyText}>{lang === 'ar' ? 'لا توجد أصول' : 'No assets found'}</Text>
          </View>
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', margin: 16, borderRadius: radius.md, paddingHorizontal: 12, ...shadow.sm },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 14, color: colors.text },
  list: { padding: 16, paddingTop: 8 },
  card: { backgroundColor: 'white', borderRadius: radius.md, padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'center', ...shadow.sm },
  cardLeft: { marginRight: 12 },
  assetIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.infoLight, alignItems: 'center', justifyContent: 'center' },
  cardBody: { flex: 1 },
  assetName: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 3 },
  assetMeta: { fontSize: 12, color: colors.textSecondary, marginBottom: 2 },
  assetSerial: { fontSize: 11, color: colors.textLight, fontFamily: 'monospace' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  statusText: { fontSize: 11, fontWeight: '600' },
  empty: { alignItems: 'center', padding: 48 },
  emptyText: { fontSize: 15, color: colors.textSecondary, marginTop: 12 },
})""")
print('AssetsScreen created')

# Fix 2: Update navigation to include Assets tab
with open('src/navigation/index.tsx', 'w', encoding='utf-8') as f:
    f.write("""import React from 'react'
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
}""")
print('Navigation updated with Assets tab')

# Fix 3: Fix WorkOrdersScreen to load all WOs for admin/manager
with open('src/screens/WorkOrdersScreen.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

old = """    if (profile.role === 'technician') {
      query.eq('assigned_to', profile.id)
    }"""
new = """    if (profile.role === 'technician') {
      query.eq('assigned_to', profile.id)
    }
    // admins and managers see all org WOs"""

content = content.replace(old, new)
with open('src/screens/WorkOrdersScreen.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('WorkOrdersScreen fixed')

# Fix 4: Fix AuthContext to properly load email
with open('src/context/AuthContext.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Add email to profile
old_profile = """  async function fetchProfile(userId: string) {
    const { data } = await supabase
      .from('users')
      .select('*, organisation:organisation_id(name, plan_tier, vertical)')
      .eq('id', userId)
      .single()
    setProfile(data)
    setLoading(false)
  }"""

new_profile = """  async function fetchProfile(userId: string) {
    const { data: { user: authUser } } = await supabase.auth.getUser()
    const { data } = await supabase
      .from('users')
      .select('*, organisation:organisation_id(name, plan_tier, vertical)')
      .eq('id', userId)
      .single()
    if (data) {
      data.email = authUser?.email ?? data.email
    }
    setProfile(data)
    setLoading(false)
  }"""

content = content.replace(old_profile, new_profile)
with open('src/context/AuthContext.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('AuthContext fixed with email')

print('\\nAll mobile fixes applied!')