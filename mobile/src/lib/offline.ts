// CORE-07 / MKT-03 / FM-14 — mobile offline mode, first cut.
//
// Three pieces, all AsyncStorage-backed:
//  1. Read cache: last-fetched WO list / WO detail / profile snapshots
//     (cacheGet/cacheSet), served by the screens when a fetch fails offline.
//  2. Connectivity: NetInfo listener + useOffline() hook for the banner.
//  3. Mutation queue: status changes, comments, time logs and photos made
//     offline are stored FIFO and replayed in order on reconnect. Photos are
//     replayed first so dependent mutations never land before their media
//     (FM-14). Failed items stay in the queue (surfaced as a count in the
//     banner) and are retried on the next reconnect or a manual banner tap.
//
// ponytail: last-write-wins, no per-WO ordering across devices, Complete/Close
// stays online-only — WatermelonDB sync is the upgrade path if fuller offline
// is ever needed.

import { useEffect, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import NetInfo from '@react-native-community/netinfo'
import * as FileSystem from 'expo-file-system/legacy'
import { supabase } from './supabase'

// ---------------------------------------------------------------- read cache

const CACHE_PREFIX = 'offline_cache:'

export async function cacheSet(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_PREFIX + key, JSON.stringify(value))
  } catch {} // never let caching break the online path
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

// ------------------------------------------------------------ mutation queue

export type QueuedMutation =
  // CORE-31: orgId/oldStatus carried so replay can write the same audit_logs row
  // the online path does (older queued items without them just skip the audit).
  | { kind: 'wo_status'; woId: string; updates: Record<string, any>; body: string; userId: string | null; orgId?: string | null; oldStatus?: string | null }
  | { kind: 'comment'; woId: string; body: string; userId: string | null }
  // WO-06: minutes/orgId/hourlyRate/note carried so replay also writes the
  // work_order_time_logs row the web Labor tab reads (optional = older items skip it).
  | { kind: 'time_log'; woId: string; body: string; addHours: number; userId: string | null; orgId?: string | null; minutes?: number; hourlyRate?: number | null; note?: string | null }
  // FM-14: a compressed photo saved locally, uploaded + attached to the WO on reconnect.
  | { kind: 'wo_photo'; woId: string; localUri: string; filename: string }

export type QueuedItem = QueuedMutation & {
  id: string
  createdAt: string
  error?: string
}

const QUEUE_KEY = 'offline_queue'

async function readQueue(): Promise<QueuedItem[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY)
    return raw ? (JSON.parse(raw) as QueuedItem[]) : []
  } catch {
    return []
  }
}

async function writeQueue(queue: QueuedItem[]): Promise<void> {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
  } catch {}
  state.pending = queue.filter(q => !q.error).length
  state.failed = queue.filter(q => !!q.error).length
  notify()
}

export async function enqueue(mutation: QueuedMutation): Promise<void> {
  const queue = await readQueue()
  queue.push({
    ...mutation,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  })
  await writeQueue(queue)
}

// FM-14: queue an offline photo. Copies the compressed image out of the
// manipulator cache into the app document dir (so it survives app restarts and
// cache eviction), then queues the upload+attach. Returns the durable local
// URI so the caller can show the photo immediately.
export async function enqueuePhoto(woId: string, compressedUri: string): Promise<string> {
  const filename = 'wo-' + woId + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10) + '.jpg'
  const localUri = FileSystem.documentDirectory + filename
  await FileSystem.copyAsync({ from: compressedUri, to: localUri })
  await enqueue({ kind: 'wo_photo', woId, localUri, filename })
  return localUri
}

async function replay(m: QueuedItem): Promise<void> {
  if (m.kind === 'wo_photo') {
    // Upload the locally saved file, then append its public URL to the WO.
    const response = await fetch(m.localUri)
    const blob = await response.blob()
    const arrayBuffer = await new Response(blob).arrayBuffer()
    // upsert: true — the filename is unique to this queued item, and a retry
    // after a failed DB write must not error on the already-uploaded object.
    const { error } = await supabase.storage.from('media').upload(m.filename, arrayBuffer, { contentType: 'image/jpeg', upsert: true })
    if (error) throw new Error(error.message)
    const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(m.filename)
    const { data, error: rErr } = await supabase.from('work_orders').select('photo_urls').eq('id', m.woId).single()
    if (rErr) throw new Error(rErr.message)
    const current: string[] = data?.photo_urls ?? []
    if (!current.includes(publicUrl)) {
      const { error: uErr } = await supabase.from('work_orders').update({
        photo_urls: [...current, publicUrl],
        updated_at: new Date().toISOString(),
      }).eq('id', m.woId)
      if (uErr) throw new Error(uErr.message)
    }
    // Best-effort cleanup of the local copy once it is safely attached.
    FileSystem.deleteAsync(m.localUri, { idempotent: true }).catch(() => {})
  } else if (m.kind === 'wo_status') {
    const { error } = await supabase.from('work_orders').update(m.updates).eq('id', m.woId)
    if (error) throw new Error(error.message)
    // ponytail: if the comment insert below fails, a retry re-runs the (idempotent)
    // status update and may duplicate the status comment — acceptable v1.
    const { error: cErr } = await supabase.from('work_order_comments').insert({
      work_order_id: m.woId, user_id: m.userId, body: m.body, comment_type: 'status_change',
    })
    if (cErr) throw new Error(cErr.message)
    // CORE-31: audit the transition — mirrors the online WO detail write so
    // offline status changes are audited too. ponytail: a retry after a later
    // failure may duplicate this audit row (same as the comment above) — v1 ok.
    if (m.orgId) {
      const { error: aErr } = await supabase.from('audit_logs').insert({
        entity_type: 'work_order', entity_id: m.woId,
        action: `Status changed to ${m.updates.status}`,
        user_id: m.userId, organisation_id: m.orgId,
        new_values: { status: m.updates.status },
        old_values: { status: m.oldStatus ?? null },
        impersonated_by: null,
      })
      if (aErr) throw new Error(aErr.message)
    }
  } else if (m.kind === 'comment') {
    const { error } = await supabase.from('work_order_comments').insert({
      work_order_id: m.woId, user_id: m.userId, body: m.body, comment_type: 'comment',
    })
    if (error) throw new Error(error.message)
  } else {
    const { error } = await supabase.from('work_order_comments').insert({
      work_order_id: m.woId, user_id: m.userId, body: m.body, comment_type: 'time_log',
    })
    if (error) throw new Error(error.message)
    const { data, error: rErr } = await supabase
      .from('work_orders').select('actual_hours').eq('id', m.woId).single()
    if (rErr) throw new Error(rErr.message)
    const { error: uErr } = await supabase.from('work_orders').update({
      actual_hours: parseFloat((Number(data?.actual_hours ?? 0) + m.addHours).toFixed(2)),
    }).eq('id', m.woId)
    if (uErr) throw new Error(uErr.message)
    // WO-06: also write the labor row the web Labor tab reads. minutes has a
    // CHECK (> 0) constraint, so skip zero-minute logs.
    if (m.orgId && m.minutes && m.minutes > 0) {
      const { error: lErr } = await supabase.from('work_order_time_logs').insert({
        organisation_id: m.orgId, work_order_id: m.woId, user_id: m.userId,
        minutes: m.minutes, hourly_rate: m.hourlyRate ?? null,
        note: m.note ?? null, created_by: m.userId,
      })
      if (lErr) throw new Error(lErr.message)
    }
  }
}

let flushing = false

// Replay queued mutations FIFO. Failures keep their item queued (with the
// error recorded) and do not block later items.
export async function flushQueue(): Promise<void> {
  if (flushing || !state.online) return
  flushing = true
  try {
    // Wait for the persisted session to be restored (and skip when signed
    // out) so a cold-start flush doesn't fail every item on RLS.
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const queue = await readQueue()
    if (queue.length === 0) return
    // FM-14: upload queued photos first so mutations that reference their
    // work orders replay against fully-attached media. FIFO within each group.
    const ordered = [
      ...queue.filter(q => q.kind === 'wo_photo'),
      ...queue.filter(q => q.kind !== 'wo_photo'),
    ]
    const remaining: QueuedItem[] = []
    for (const item of ordered) {
      try {
        await replay(item)
      } catch (e: any) {
        remaining.push({ ...item, error: e?.message || 'Sync failed' })
      }
    }
    await writeQueue(remaining)
  } finally {
    flushing = false
  }
}

// -------------------------------------------------- connectivity + hook state

const state = { online: true, pending: 0, failed: 0 }
const listeners = new Set<() => void>()

function notify() {
  listeners.forEach(fn => fn())
}

export const isOnline = () => state.online

// NetInfo emits the current state on subscribe, so this also seeds the initial
// value and flushes any queue left over from a previous session.
NetInfo.addEventListener(netState => {
  const online = !!netState.isConnected && netState.isInternetReachable !== false
  if (online === state.online) return
  state.online = online
  notify()
  if (online) flushQueue()
})

// Seed queue counts on startup.
readQueue().then(queue => {
  state.pending = queue.filter(q => !q.error).length
  state.failed = queue.filter(q => !!q.error).length
  notify()
  if (state.online && queue.length > 0) flushQueue()
})

export function useOffline() {
  const [, force] = useState(0)
  useEffect(() => {
    const fn = () => force(n => n + 1)
    listeners.add(fn)
    return () => { listeners.delete(fn) }
  }, [])
  return { online: state.online, pending: state.pending, failed: state.failed, retry: flushQueue }
}
