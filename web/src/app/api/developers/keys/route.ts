// /api/developers/keys — admin-only API key management for /dashboard/developers.
//   GET    list keys (metadata only; NEVER the hash or plaintext)
//   POST   create a key — returns the plaintext ONCE, stores only the hash
//   DELETE ?id=  revoke a key (soft: sets revoked_at)

import { NextRequest, NextResponse } from 'next/server'
import { resolveAdmin, generateApiKey, VALID_SCOPES } from '../_helpers'

export const dynamic = 'force-dynamic'

export async function GET() {
  const ctx = await resolveAdmin()
  if (ctx instanceof NextResponse) return ctx

  const { data, error } = await ctx.admin
    .from('api_keys')
    .select('id, name, key_prefix, scopes, last_used_at, revoked_at, created_at')
    .eq('organisation_id', ctx.orgId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[developers/keys GET] failed', error)
    return NextResponse.json({ error: 'Failed to load keys' }, { status: 500 })
  }
  return NextResponse.json({ data: data ?? [] })
}

export async function POST(req: NextRequest) {
  const ctx = await resolveAdmin()
  if (ctx instanceof NextResponse) return ctx

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

  const scopes = Array.isArray(body.scopes)
    ? (body.scopes as unknown[]).filter((s): s is string => typeof s === 'string' && VALID_SCOPES.includes(s as never))
    : []
  if (scopes.length === 0) {
    return NextResponse.json({ error: 'Select at least one valid scope' }, { status: 400 })
  }

  const { plaintext, hash, prefix } = generateApiKey()

  const { data, error } = await ctx.admin
    .from('api_keys')
    .insert({
      organisation_id: ctx.orgId,
      name,
      key_hash: hash,
      key_prefix: prefix,
      scopes,
      created_by: ctx.userId,
    })
    .select('id, name, key_prefix, scopes, created_at')
    .single()

  if (error) {
    console.error('[developers/keys POST] failed', error)
    return NextResponse.json({ error: 'Failed to create key' }, { status: 500 })
  }

  // plaintext is returned ONCE and never persisted anywhere.
  return NextResponse.json({ data: { ...data, plaintext } }, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const ctx = await resolveAdmin()
  if (ctx instanceof NextResponse) return ctx

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  // org filter here + RLS both scope the revoke to the caller's org.
  const { error } = await ctx.admin
    .from('api_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organisation_id', ctx.orgId)

  if (error) {
    console.error('[developers/keys DELETE] failed', error)
    return NextResponse.json({ error: 'Failed to revoke key' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
