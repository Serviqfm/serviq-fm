// CORE-07 / MKT-03 / FM-14 — mobile offline mode, first cut.
//
// Three pieces, all AsyncStorage-backed:
//  1. Read cache: last-fetched WO list / WO detail / profile snapshots
//     (cacheGet/cacheSet), served by the screens when a fetch fails offline.
//  2. Connectivity: NetInfo listener + useOffline() hook for the banner.
//  3. Mutation queue: status changes, comments and time logs made offline are
//     stored FIFO and replayed in order on reconnect. Failed items stay in the
//     queue (surfaced as a count in the banner) and are retried on the next
//     reconnect or a manual banner tap.
//
// ponytail: last-write-wins, no per-WO ordering across devices, photo uploads
// and Complete/Close stay online-only — WatermelonDB sync is the upgrade path
// if fuller offline is ever needed.

import { useEffect, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import NetInfo from '@react-native-community/netinfo'
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
  | { kind: 'wo_status'; woId: string; updates: Record<string, any>; body: string; userId: string | null }
  | { kind: 'comment'; woId: string; body: string; userId: string | null }
  | { kind: 'time_log'; woId: string; body: string; addHours: number; userId: string | null }

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

async function replay(m: QueuedItem): Promise<void> {
  if (m.kind === 'wo_status') {
    const { error } = await supabase.from('work_orders').update(m.updates).eq('id', m.woId)
    if (error) throw new Error(error.message)
    // ponytail: if the comment insert below fails, a retry re-runs the (idempotent)
    // status update and may duplicate the status comment — acceptable v1.
    const { error: cErr } = await supabase.from('work_order_comments').insert({
      work_order_id: m.woId, user_id: m.userId, body: m.body, comment_type: 'status_change',
    })
    if (cErr) throw new Error(cErr.message)
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
    const remaining: QueuedItem[] = []
    for (const item of queue) {
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
