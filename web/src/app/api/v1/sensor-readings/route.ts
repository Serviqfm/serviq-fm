// POST /api/v1/sensor-readings — IoT/BMS reading ingest (MKT-23).
// Key-authenticated via the shared /api/v1 flow. Org comes from the API key, never the
// body. Accepts {device_id, value}; the device must belong to the key's org.
//
// ponytail: no dedicated scope. Device-ownership IS the authorization here — a key can
// only push to a device in its own org. Adding a 'sensor-readings:write' scope would
// mean touching the shared developers UI + VALID_SCOPES so keys could actually be
// granted it; add that if per-key scoping of ingest is ever needed.

import { NextRequest, NextResponse } from 'next/server'
import { authenticateApiKey, jsonError } from '../_auth'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const ctx = await authenticateApiKey(req)
  if (ctx instanceof NextResponse) return ctx

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>

  const deviceId = typeof body.device_id === 'string' ? body.device_id.trim() : ''
  if (!deviceId) return jsonError(400, 'invalid_request', 'device_id is required')

  const value = typeof body.value === 'number' ? body.value : Number(body.value)
  if (!Number.isFinite(value)) return jsonError(400, 'invalid_request', 'value must be a number')

  // Trust-boundary: verify the device belongs to the key's org before inserting.
  const { data: device } = await ctx.admin
    .from('sensor_devices')
    .select('id, name, min_threshold, max_threshold')
    .eq('id', deviceId)
    .eq('organisation_id', ctx.orgId)
    .maybeSingle()
  if (!device) return jsonError(400, 'invalid_request', 'device_id not found in your organisation')

  const { data, error } = await ctx.admin
    .from('sensor_readings')
    .insert({ organisation_id: ctx.orgId, device_id: deviceId, value })
    .select('id, device_id, value, reading_at')
    .single()

  if (error) {
    console.error('[api/v1/sensor-readings POST] insert failed', error)
    return jsonError(500, 'server_error', 'Failed to record reading')
  }

  // Flag threshold breach in the response so the caller knows immediately.
  const min = device.min_threshold as number | null
  const max = device.max_threshold as number | null
  const breached = (min != null && value < min) || (max != null && value > max)

  return NextResponse.json({ data: { ...data, out_of_threshold: breached } }, { status: 201 })
}
