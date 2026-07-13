// web/src/app/api/asset-log/[id]/condition-reviews/route.ts
// POST — log a condition review (admin/manager/technician) and sync the item row
// (condition_rating, is_usable, condition_notes, last_condition_review_at).
// Two writes must stay consistent, so this runs server-side via the admin client.

import { NextRequest, NextResponse } from 'next/server'
import { resolveCaller, auditAssetLog } from '../../_helpers'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!id) return NextResponse.json({ error: 'Missing item id' }, { status: 400 })

  const caller = await resolveCaller(['admin', 'manager', 'technician'])
  if (caller instanceof NextResponse) return caller
  const { orgId, userId, admin } = caller

  const body = (await req.json()) as Record<string, unknown>

  const rating = typeof body.rating === 'number' ? Math.trunc(body.rating) : parseInt(String(body.rating), 10)
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: 'Rating must be 1–5' }, { status: 400 })
  }
  const isUsable = body.is_usable === false ? false : true
  const notes = typeof body.notes === 'string' && body.notes.trim() !== '' ? body.notes.trim() : null
  const photoUrls = Array.isArray(body.photo_urls) ? body.photo_urls : []

  // Item must exist in the caller's org before we log against it.
  const { data: item } = await admin
    .from('asset_log_items').select('id').eq('id', id).eq('organisation_id', orgId).maybeSingle()
  if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

  const reviewedAt = new Date().toISOString()

  const { data: review, error } = await admin
    .from('asset_log_condition_reviews')
    .insert({
      organisation_id: orgId,
      item_id: id,
      rating,
      is_usable: isUsable,
      notes,
      photo_urls: photoUrls,
      reviewed_by: userId,
      reviewed_at: reviewedAt,
    })
    .select()
    .single()

  if (error) {
    console.error('[asset-log condition-reviews] insert failed', error)
    return NextResponse.json({ error: error.message || 'Failed to log review' }, { status: 500 })
  }

  // Sync the header fields off the latest review.
  await admin.from('asset_log_items')
    .update({
      condition_rating: rating,
      is_usable: isUsable,
      condition_notes: notes,
      last_condition_review_at: reviewedAt,
      updated_at: reviewedAt,
    })
    .eq('id', id).eq('organisation_id', orgId)

  await auditAssetLog(admin, { userId, orgId }, id, 'Condition reviewed', { new_values: { rating, is_usable: isUsable } })
  return NextResponse.json({ review })
}
