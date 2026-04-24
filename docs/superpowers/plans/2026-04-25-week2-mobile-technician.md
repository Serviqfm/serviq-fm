# Week 2 — Mobile Technician Experience + Push Notifications

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a complete, demo-ready technician mobile experience — QR scanning, timers, PM tasks on home screen, asset status, and real push notifications on device.

**Architecture:** All mobile screens use existing NativeWind + StyleSheet pattern. Push notifications use `expo-notifications` (already installed) with Supabase edge function to trigger server-side. QR scanner uses `expo-camera` (already installed) with barcode scanning.

**Tech Stack:** Expo SDK 54, React Native 0.81, expo-notifications, expo-camera, expo-barcode-scanner, Supabase Edge Functions

---

## File Map

| Action | File |
|--------|------|
| Create | `mobile/src/screens/QRScannerScreen.tsx` |
| Modify | `mobile/src/navigation/index.tsx` — add QRScanner route |
| Modify | `mobile/src/screens/AssetsScreen.tsx` — add QR scan button + breakdown badge |
| Modify | `mobile/src/screens/HomeScreen.tsx` — add PM tasks section |
| Modify | `mobile/src/screens/WorkOrderDetailScreen.tsx` — add 24hr countdown timer |
| Modify | `mobile/src/screens/WorkOrdersScreen.tsx` — add countdown pill on cards |
| Create | `mobile/src/lib/notifications.ts` — push token registration + permission |
| Modify | `mobile/src/context/AuthContext.tsx` — register push token after login |
| Create | `supabase/functions/send-push/index.ts` — Supabase Edge Function |
| Modify | `mobile/app.json` — add notification config |

---

## Task 1: QR Scanner Screen

**Files:**
- Create: `mobile/src/screens/QRScannerScreen.tsx`
- Modify: `mobile/src/navigation/index.tsx`
- Modify: `mobile/src/screens/AssetsScreen.tsx`

- [ ] **Create `mobile/src/screens/QRScannerScreen.tsx`:**

```tsx
import React, { useState, useEffect } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { useNavigation } from '@react-navigation/native'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { colors } from '../lib/theme'

export default function QRScannerScreen() {
  const [permission, requestPermission] = useCameraPermissions()
  const [scanned, setScanned] = useState(false)
  const navigation = useNavigation<any>()
  const { profile } = useAuth()

  useEffect(() => {
    if (!permission?.granted) requestPermission()
  }, [])

  async function handleBarCodeScanned({ data }: { data: string }) {
    if (scanned) return
    setScanned(true)

    // data can be a full URL like https://app.serviqfm.com/dashboard/assets/<id>
    // or just a UUID (QR code stored directly as asset.qr_code)
    let assetId: string | null = null

    // Try to extract UUID from URL
    const urlMatch = data.match(/assets\/([0-9a-f-]{36})/i)
    if (urlMatch) {
      assetId = urlMatch[1]
    } else if (/^[0-9a-f-]{36}$/i.test(data)) {
      // Raw UUID
      assetId = data
    } else {
      // Try to find asset by qr_code field
      const { data: asset } = await supabase
        .from('assets')
        .select('id')
        .eq('qr_code', data)
        .eq('organisation_id', profile?.organisation_id)
        .single()
      assetId = asset?.id ?? null
    }

    if (!assetId) {
      Alert.alert(
        'Not Found',
        'This QR code does not match any asset in your organisation.',
        [{ text: 'Scan Again', onPress: () => setScanned(false) }]
      )
      return
    }

    navigation.replace('AssetDetail', { id: assetId })
  }

  if (!permission) {
    return (
      <View style={styles.center}>
        <Text style={styles.text}>Requesting camera permission...</Text>
      </View>
    )
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.text}>Camera access required to scan QR codes.</Text>
        <TouchableOpacity style={styles.btn} onPress={requestPermission}>
          <Text style={styles.btnText}>Grant Access</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View style={{ flex: 1 }}>
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
      />

      {/* Overlay */}
      <View style={styles.overlay}>
        <View style={styles.scanBox} />
        <Text style={styles.hint}>
          {scanned ? 'Opening asset...' : 'Point at an asset QR code'}
        </Text>
        {scanned && (
          <TouchableOpacity style={styles.btn} onPress={() => setScanned(false)}>
            <Text style={styles.btnText}>Scan Again</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[styles.btn, { marginTop: 12, backgroundColor: 'rgba(255,255,255,0.2)' }]} onPress={() => navigation.goBack()}>
          <Text style={[styles.btnText, { color: 'white' }]}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  text: { fontSize: 15, color: '#444', textAlign: 'center', marginBottom: 16 },
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  scanBox: {
    width: 240, height: 240,
    borderWidth: 2, borderColor: colors.teal ?? '#6DCFB0',
    borderRadius: 16, backgroundColor: 'transparent',
    marginBottom: 32,
  },
  hint: { color: 'white', fontSize: 15, fontWeight: '600', marginBottom: 24, textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  btn: { backgroundColor: colors.primary, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 10 },
  btnText: { color: 'white', fontWeight: '600', fontSize: 15 },
})
```

- [ ] **Add QRScanner to `mobile/src/navigation/index.tsx`:**

Add import:
```tsx
import QRScannerScreen from '../screens/QRScannerScreen'
```

Inside `RootNavigator`, after the `AssetDetail` Stack.Screen:
```tsx
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
```

- [ ] **Add QR scan button to `mobile/src/screens/AssetsScreen.tsx`:**

In the header area next to the "Assets" title, add:
```tsx
<TouchableOpacity
  onPress={() => navigation.navigate('QRScanner' as never)}
  style={{ padding: 8, backgroundColor: colors.primary + '15', borderRadius: 10 }}>
  <Ionicons name="qr-code-outline" size={22} color={colors.primary} />
</TouchableOpacity>
```

- [ ] **Verify:** On device/simulator, tap QR icon on Assets screen → camera opens → scan an asset QR code → navigates to AssetDetail. Scan an unknown code → shows "Not Found" alert.

- [ ] **Commit:**
```bash
git add mobile/src/screens/QRScannerScreen.tsx mobile/src/navigation/index.tsx mobile/src/screens/AssetsScreen.tsx
git commit -m "feat: QR scanner opens asset detail on scan"
```

---

## Task 2: Asset Breakdown Status Indicator

**Files:**
- Modify: `mobile/src/screens/AssetsScreen.tsx`

- [ ] **Add breakdown badge to asset cards in `AssetsScreen.tsx`:**

In the asset card render, after the asset name, add:
```tsx
{item.status === 'under_maintenance' && (
  <View style={{
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#FEF3C7', paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 20, alignSelf: 'flex-start', marginTop: 4,
  }}>
    <Ionicons name="construct-outline" size={11} color="#92400E" />
    <Text style={{ fontSize: 11, color: '#92400E', fontWeight: '600' }}>
      {t('under_maintenance') ?? 'Under Maintenance'}
    </Text>
  </View>
)}
{item.status === 'retired' && (
  <View style={{
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#F1F5F9', paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 20, alignSelf: 'flex-start', marginTop: 4,
  }}>
    <Ionicons name="archive-outline" size={11} color="#64748B" />
    <Text style={{ fontSize: 11, color: '#64748B', fontWeight: '600' }}>
      {t('retired') ?? 'Retired'}
    </Text>
  </View>
)}
```

- [ ] **Update the Supabase query in `AssetsScreen.tsx`** to include `status` in the select:
```tsx
.select('id, name, category, site_id, serial_number, status, qr_code')
```

- [ ] **Verify:** Asset with `status = 'under_maintenance'` shows amber badge. `status = 'retired'` shows grey badge. Active assets show no badge.

- [ ] **Commit:**
```bash
git add mobile/src/screens/AssetsScreen.tsx
git commit -m "feat: asset breakdown status badge on cards"
```

---

## Task 3: 24-Hour Countdown Timer on Work Orders

**Files:**
- Modify: `mobile/src/screens/WorkOrdersScreen.tsx`
- Modify: `mobile/src/screens/WorkOrderDetailScreen.tsx`

- [ ] **Create countdown helper** — add to top of `WorkOrdersScreen.tsx` (before the component):

```tsx
function useCountdown(dueAt: string | null) {
  const [timeLeft, setTimeLeft] = useState<string | null>(null)
  const [isUrgent, setIsUrgent] = useState(false)

  useEffect(() => {
    if (!dueAt) return
    function tick() {
      const diff = new Date(dueAt!).getTime() - Date.now()
      if (diff <= 0) {
        setTimeLeft('Overdue')
        setIsUrgent(true)
        return
      }
      const hrs = Math.floor(diff / 3600000)
      const mins = Math.floor((diff % 3600000) / 60000)
      if (hrs < 24) {
        setIsUrgent(true)
        setTimeLeft(hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`)
      } else {
        setIsUrgent(false)
        setTimeLeft(null) // don't show timer if > 24hrs
      }
    }
    tick()
    const id = setInterval(tick, 60000)
    return () => clearInterval(id)
  }, [dueAt])

  return { timeLeft, isUrgent }
}
```

- [ ] **Add countdown pill to work order card in `WorkOrdersScreen.tsx`:**

In the card render, create a `CountdownPill` inline component:
```tsx
function CountdownPill({ dueAt }: { dueAt: string | null }) {
  const { timeLeft, isUrgent } = useCountdown(dueAt)
  if (!timeLeft) return null
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 4,
      backgroundColor: timeLeft === 'Overdue' ? '#FEE2E2' : '#FEF3C7',
      paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20,
    }}>
      <Ionicons name="time-outline" size={11} color={timeLeft === 'Overdue' ? '#C62828' : '#92400E'} />
      <Text style={{ fontSize: 11, fontWeight: '700', color: timeLeft === 'Overdue' ? '#C62828' : '#92400E' }}>
        {timeLeft}
      </Text>
    </View>
  )
}
```

Use it in the card:
```tsx
<CountdownPill dueAt={item.due_at} />
```

- [ ] **Add larger countdown banner to `WorkOrderDetailScreen.tsx`:**

At the top of the detail view, just below the title section, insert:
```tsx
{wo.due_at && (() => {
  const diff = new Date(wo.due_at).getTime() - Date.now()
  const hrs = Math.floor(diff / 3600000)
  if (diff > 0 && hrs < 24) {
    const mins = Math.floor((diff % 3600000) / 60000)
    return (
      <View style={{ backgroundColor: '#FEF3C7', padding: 12, marginHorizontal: 16, borderRadius: 10, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name="warning-outline" size={18} color="#92400E" />
        <Text style={{ color: '#92400E', fontWeight: '600', fontSize: 14 }}>
          Due in {hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`}
        </Text>
      </View>
    )
  }
  if (diff <= 0) {
    return (
      <View style={{ backgroundColor: '#FEE2E2', padding: 12, marginHorizontal: 16, borderRadius: 10, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name="alert-circle-outline" size={18} color="#C62828" />
        <Text style={{ color: '#C62828', fontWeight: '600', fontSize: 14 }}>Overdue</Text>
      </View>
    )
  }
  return null
})()}
```

- [ ] **Verify:** Work order with `due_at` within 24 hours shows countdown pill. Overdue shows red "Overdue" badge.

- [ ] **Commit:**
```bash
git add mobile/src/screens/WorkOrdersScreen.tsx mobile/src/screens/WorkOrderDetailScreen.tsx
git commit -m "feat: 24hr countdown timer on work order cards and detail"
```

---

## Task 4: PM Tasks on Technician Home Screen

**Files:**
- Modify: `mobile/src/screens/HomeScreen.tsx`

- [ ] **Add PM tasks state to `HomeScreen.tsx`:**

```tsx
const [upcomingPMs, setUpcomingPMs] = useState<any[]>([])
```

- [ ] **Add PM query to `fetchData()` in `HomeScreen.tsx`:**

```tsx
// Add alongside the existing work orders query
const { data: pms } = await supabase
  .from('pm_schedules')
  .select('id, title, next_due_at, asset:asset_id(name)')
  .eq('organisation_id', profile.organisation_id)
  .eq('assigned_to', profile.id)
  .eq('is_active', true)
  .gte('next_due_at', new Date().toISOString())
  .order('next_due_at', { ascending: true })
  .limit(5)

setUpcomingPMs(pms ?? [])
```

- [ ] **Add PM section to `HomeScreen.tsx` render**, after the recent work orders section:

```tsx
{upcomingPMs.length > 0 && (
  <View style={{ marginTop: 24 }}>
    <Text style={[styles.sectionTitle, isRTL && { textAlign: 'right' }]}>
      {t('upcoming_pm') ?? 'Upcoming PM Tasks'}
    </Text>
    {upcomingPMs.map(pm => {
      const days = Math.ceil((new Date(pm.next_due_at).getTime() - Date.now()) / 86400000)
      return (
        <View key={pm.id} style={[styles.card, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textDark ?? '#1E2D4E' }} numberOfLines={1}>
              {pm.title}
            </Text>
            <Text style={{ fontSize: 12, color: colors.textMid ?? '#4A5568', marginTop: 2 }}>
              {pm.asset?.name ?? 'No asset'}
            </Text>
          </View>
          <View style={{
            backgroundColor: days <= 1 ? '#FEE2E2' : days <= 7 ? '#FEF3C7' : '#DCFCE7',
            paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, marginLeft: 8,
          }}>
            <Text style={{
              fontSize: 11, fontWeight: '700',
              color: days <= 1 ? '#C62828' : days <= 7 ? '#92400E' : '#166534',
            }}>
              {days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `In ${days}d`}
            </Text>
          </View>
        </View>
      )
    })}
  </View>
)}
```

- [ ] **Add translation keys** to `mobile/src/i18n/index.ts` for `upcoming_pm`:
```ts
// in English section:
upcoming_pm: 'Upcoming PM Tasks',
// in Arabic section:
upcoming_pm: 'مهام الصيانة القادمة',
```

- [ ] **Verify:** Technician home screen shows PM tasks assigned to them, colour-coded by due date urgency.

- [ ] **Commit:**
```bash
git add mobile/src/screens/HomeScreen.tsx mobile/src/i18n/index.ts
git commit -m "feat: PM tasks section on technician home screen"
```

---

## Task 5: Push Notification Setup (Client)

**Files:**
- Create: `mobile/src/lib/notifications.ts`
- Modify: `mobile/src/context/AuthContext.tsx`
- Modify: `mobile/app.json`

- [ ] **Update `mobile/app.json`** — add notification config inside the `expo` key:

```json
"plugins": [
  [
    "expo-notifications",
    {
      "icon": "./assets/icon.png",
      "color": "#1E2D4E",
      "sounds": [],
      "androidMode": "default",
      "androidCollapsedTitle": "Serviq FM"
    }
  ]
],
"notification": {
  "icon": "./assets/icon.png",
  "color": "#1E2D4E"
}
```

- [ ] **Create `mobile/src/lib/notifications.ts`:**

```typescript
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { supabase } from './supabase'

// Set how notifications appear when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
})

export async function registerPushToken(userId: string): Promise<void> {
  // Request permission
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

  // Get Expo push token
  const tokenData = await Notifications.getExpoPushTokenAsync({
    projectId: process.env.EXPO_PUBLIC_PROJECT_ID, // set in .env
  })

  const token = tokenData.data

  // Store token in Supabase user record
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
```

- [ ] **Add `push_token` column to Supabase `users` table** — run in Supabase SQL Editor:

```sql
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS push_token text,
  ADD COLUMN IF NOT EXISTS push_platform text;
```

- [ ] **Modify `mobile/src/context/AuthContext.tsx`** — call `registerPushToken` after successful sign-in:

After the profile is fetched and `setProfile(profile)` is called, add:
```tsx
import { registerPushToken } from '../lib/notifications'

// after setProfile(profile):
if (profile?.id) {
  registerPushToken(profile.id).catch(console.error)
}
```

- [ ] **Create `mobile/.env`** (if it doesn't exist):
```
EXPO_PUBLIC_PROJECT_ID=your-expo-project-id-here
EXPO_PUBLIC_SUPABASE_URL=your-supabase-url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

> Get `EXPO_PUBLIC_PROJECT_ID` from Expo dashboard at expo.dev under your project settings.

- [ ] **Verify:** Sign in on a physical device → check Supabase `users` table → `push_token` field populated with `ExponentPushToken[...]`.

- [ ] **Commit:**
```bash
git add mobile/src/lib/notifications.ts mobile/src/context/AuthContext.tsx mobile/app.json
git commit -m "feat: register Expo push token after login"
```

---

## Task 6: Push Notification — Supabase Edge Function

**Files:**
- Create: `supabase/functions/send-push/index.ts`

This function is called server-side whenever a work order is assigned or changes status.

- [ ] **Create `supabase/functions/send-push/index.ts`:**

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

interface PushPayload {
  user_id: string
  title: string
  body: string
  data?: Record<string, string>
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const payload: PushPayload = await req.json()
  const { user_id, title, body, data } = payload

  // Get push token for user
  const { data: user, error } = await supabase
    .from('users')
    .select('push_token')
    .eq('id', user_id)
    .single()

  if (error || !user?.push_token) {
    return new Response(JSON.stringify({ error: 'No push token for user' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Send via Expo push API
  const message = {
    to: user.push_token,
    sound: 'default',
    title,
    body,
    data: data ?? {},
    badge: 1,
  }

  const response = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip, deflate',
    },
    body: JSON.stringify(message),
  })

  const result = await response.json()
  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json' },
  })
})
```

- [ ] **Deploy the Edge Function:**
```bash
supabase functions deploy send-push --no-verify-jwt
```

- [ ] **Test the function** manually in Supabase Dashboard → Edge Functions → send-push → Test with:
```json
{
  "user_id": "your-test-user-uuid",
  "title": "New Work Order",
  "body": "You have been assigned a new work order",
  "data": { "type": "work_order", "id": "test-id" }
}
```
Expected: push notification appears on the test device.

- [ ] **Commit:**
```bash
git add supabase/functions/send-push/
git commit -m "feat: Supabase Edge Function for Expo push notifications"
```

---

## Task 7: Trigger Push on Work Order Assignment (Web)

**Files:**
- Modify: `web/src/app/dashboard/work-orders/[id]/page.tsx` — call push function on assign
- Modify: `web/src/app/dashboard/work-orders/new/page.tsx` — call push function on create with assignee

- [ ] **Create `web/src/lib/push.ts`:**

```typescript
export async function sendPushNotification(payload: {
  user_id: string
  title: string
  body: string
  data?: Record<string, string>
}) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  await fetch(`${supabaseUrl}/functions/v1/send-push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}
```

- [ ] **In `work-orders/new/page.tsx`**, after a successful work order insert, if `assigned_to` is set:

```typescript
import { sendPushNotification } from '@/lib/push'

// After successful WO insert:
if (form.assigned_to) {
  await sendPushNotification({
    user_id: form.assigned_to,
    title: 'New Work Order Assigned',
    body: `You have been assigned: ${form.title}`,
    data: { type: 'work_order', id: newWO.id },
  })
}
```

- [ ] **In `work-orders/[id]/page.tsx`**, in the status update function, when status changes notify the right party:

```typescript
import { sendPushNotification } from '@/lib/push'

// After status update in updateStatus():
const messages: Record<string, { title: string; body: string }> = {
  assigned:    { title: 'Work Order Assigned', body: `WO "${wo.title}" has been assigned to you` },
  in_progress: { title: 'Work Order Started', body: `WO "${wo.title}" is now in progress` },
  completed:   { title: 'Work Order Completed', body: `WO "${wo.title}" has been completed — awaiting your approval` },
  closed:      { title: 'Work Order Closed', body: `WO "${wo.title}" has been approved and closed` },
}

const msg = messages[newStatus]
if (msg) {
  // Notify assignee on assignment/progress
  if (['assigned', 'in_progress'].includes(newStatus) && wo.assigned_to) {
    await sendPushNotification({ user_id: wo.assigned_to, ...msg, data: { type: 'work_order', id: wo.id } })
  }
  // Notify requester on completed/closed
  if (['completed', 'closed'].includes(newStatus) && wo.created_by) {
    await sendPushNotification({ user_id: wo.created_by, ...msg, data: { type: 'work_order', id: wo.id } })
  }
}
```

- [ ] **Verify:** 
  1. Create a work order with an assigned technician
  2. Technician's phone receives push notification with WO title
  3. Change status to `in_progress` → technician gets notified
  4. Complete WO → requester gets notified

- [ ] **Commit:**
```bash
git add web/src/lib/push.ts web/src/app/dashboard/work-orders/
git commit -m "feat: trigger push notifications on WO assignment and status changes"
```

---

## Task 8: Language Toggle — Mobile End-to-End

**Files:**
- Modify: `mobile/src/i18n/index.ts` — verify all keys present
- Modify: `mobile/src/screens/ProfileScreen.tsx` — verify language toggle persists

- [ ] **Check `mobile/src/i18n/index.ts`** has all keys used in Home, WorkOrders, Assets, Profile screens. Add any missing keys:

```typescript
// Ensure these are present in both en and ar:
under_maintenance: 'Under Maintenance',  // en
under_maintenance: 'تحت الصيانة',        // ar
retired: 'Retired',                       // en
retired: 'متقاعد',                        // ar
upcoming_pm: 'Upcoming PM Tasks',         // en
upcoming_pm: 'مهام الصيانة القادمة',      // ar
scan_qr: 'Scan QR',                       // en
scan_qr: 'مسح رمز QR',                   // ar
```

- [ ] **Verify language toggle in ProfileScreen:**
  1. Open Profile tab
  2. Toggle to Arabic
  3. Confirm: all tabs, headers, and card text switch to Arabic
  4. Confirm: RTL layout applied (text right-aligned where `isRTL` is used)
  5. Kill and reopen app — language persists

- [ ] **Fix any hardcoded English strings** found during verification — wrap in `t()` and add key to `i18n/index.ts`.

- [ ] **Commit:**
```bash
git add mobile/src/i18n/index.ts mobile/src/screens/ProfileScreen.tsx
git commit -m "feat: language toggle end-to-end mobile, all keys present"
```

---

## Task 9: EAS Build Configuration

**Files:**
- Create or modify: `mobile/eas.json`

- [ ] **Create/update `mobile/eas.json`:**

```json
{
  "cli": {
    "version": ">= 10.0.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "env": {
        "EXPO_PUBLIC_PROJECT_ID": "your-project-id"
      }
    },
    "preview": {
      "distribution": "internal",
      "android": { "buildType": "apk" }
    },
    "production": {
      "autoIncrement": true
    }
  },
  "submit": {
    "production": {}
  }
}
```

- [ ] **Run a preview build** (internal distribution — sends APK to your phone for testing):
```bash
cd mobile && eas build --profile preview --platform android
```
Expected: build link sent to email, installs as APK on Android.

- [ ] **Verify on real device:** Push notifications work end-to-end with the preview build.

- [ ] **Commit:**
```bash
git add mobile/eas.json
git commit -m "chore: EAS build config for preview and production"
```

---

## Demo Checkpoint — End of Week 2

Walk through this flow on device:

1. Log in as technician → home screen shows WOs + PM tasks ✓
2. WO with due_at within 24hrs shows countdown timer ✓
3. Tap Assets tab → QR scan button visible ✓
4. Scan asset QR code → navigates to AssetDetail ✓
5. Asset with `under_maintenance` status shows amber badge ✓
6. Manager creates WO on web, assigns to technician → phone gets push notification ✓
7. Status changes on web → requester phone gets push notification ✓
8. Toggle language to Arabic → full Arabic RTL throughout ✓
