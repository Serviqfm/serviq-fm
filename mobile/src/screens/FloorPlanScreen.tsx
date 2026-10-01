import React, { useEffect, useLayoutEffect, useState } from 'react'
import { View, Text, Image, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native'
import { useNavigation, useRoute } from '@react-navigation/native'
import { supabase } from '../lib/supabase'
import { useLang } from '../context/LangContext'
import { colors, radius } from '../lib/theme'

// Read-only floor plan viewer: opened from a space (Locations / work order).
// Shows every plan that has a pin for that space, with the space's pins highlighted.
export default function FloorPlanScreen() {
  const navigation = useNavigation<any>()
  const { spaceId } = useRoute<any>().params as { spaceId: string }
  const { t } = useLang()
  const [loading, setLoading] = useState(true)
  const [plans, setPlans] = useState<any[]>([])
  const [pins, setPins] = useState<any[]>([])
  const [planId, setPlanId] = useState<string | null>(null)
  const [width, setWidth] = useState(0)
  const [ratio, setRatio] = useState(1)
  const [space, setSpace] = useState<any>(null)

  useLayoutEffect(() => { navigation.setOptions({ title: t('floor_plan') }) }, [navigation, t])

  useEffect(() => {
    (async () => {
      const [{ data: sp }, { data: own }] = await Promise.all([
        supabase.from('spaces').select('name, floor').eq('id', spaceId).maybeSingle(),
        supabase.from('floor_plan_pins').select('floor_plan_id').eq('space_id', spaceId),
      ])
      setSpace(sp)
      const ids = Array.from(new Set((own ?? []).map(p => p.floor_plan_id)))
      if (ids.length) {
        const [{ data: pl }, { data: allPins }] = await Promise.all([
          supabase.from('floor_plans').select('id, name, image_url').in('id', ids),
          supabase.from('floor_plan_pins').select('id, floor_plan_id, space_id, label, x, y').in('floor_plan_id', ids),
        ])
        setPlans(pl ?? [])
        setPins(allPins ?? [])
        setPlanId(pl?.[0]?.id ?? null)
      }
      setLoading(false)
    })()
  }, [spaceId])

  const plan = plans.find(p => p.id === planId)
  useEffect(() => {
    if (plan?.image_url) Image.getSize(plan.image_url, (w, h) => setRatio(h / w || 1), () => {})
  }, [plan?.image_url])

  if (loading) return <View style={styles.centered}><ActivityIndicator color={colors.primary} /></View>
  if (!plan) return (
    <View style={styles.centered}><Text style={styles.muted}>{t('no_floor_plan_for_space')}</Text></View>
  )

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.title}>{(space?.floor ? space.floor + ' · ' : '') + (space?.name ?? '')}</Text>
      {plans.length > 1 && (
        <View style={styles.tabs}>
          {plans.map(p => (
            <TouchableOpacity key={p.id} onPress={() => setPlanId(p.id)}
              style={[styles.tab, p.id === planId && styles.tabActive]}>
              <Text style={[styles.tabText, p.id === planId && { color: 'white' }]}>{p.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      <View onLayout={e => setWidth(e.nativeEvent.layout.width)} style={{ width: '100%' }}>
        {plan.image_url && width > 0 && (
          <View style={{ width, height: width * ratio }}>
            <Image source={{ uri: plan.image_url }} style={{ width, height: width * ratio, borderRadius: radius.sm }} resizeMode='contain' />
            {pins.filter(p => p.floor_plan_id === plan.id).map(p => {
              const mine = p.space_id === spaceId
              const size = mine ? 22 : 12
              return (
                <View key={p.id} style={{
                  position: 'absolute', width: size, height: size, borderRadius: size / 2,
                  left: (p.x / 100) * width - size / 2, top: (p.y / 100) * width * ratio - size / 2,
                  backgroundColor: mine ? colors.error : colors.primary,
                  borderWidth: 2, borderColor: 'white', opacity: mine ? 1 : 0.6,
                }} />
              )
            })}
          </View>
        )}
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  muted: { fontSize: 15, color: colors.textSecondary, textAlign: 'center' },
  title: { fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: 12 },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  tab: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: 'white' },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
})
