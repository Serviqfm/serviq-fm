// web/src/app/api/erp/connection/route.ts — W7-02, ADMIN ONLY.
//   GET  the org's connection: provider, on/off, NON-secret config, last test,
//        and for each secret only { configured, last4 }. Never a secret value.
//   PUT  { provider, is_active, config, secrets? } — validate + save. Secrets are
//        AES-256-GCM encrypted into erp_credentials (service role only); a blank
//        secret field keeps the stored value. With ERP_ENCRYPTION_KEY unset,
//        saving any secret is a 501 (env-gated, like lib/stripe.ts).
//
// The browser never writes erp_connections / erp_credentials directly any more
// (w7-02 drops the client write policies); this route is the only writer.

import { NextRequest, NextResponse } from 'next/server'
import { resolveCaller } from '@/app/api/purchase-orders/_helpers'
import { credentialAad, decryptSecrets, getErpEncryptionKey } from '@/lib/erp/crypto'
import { deleteCredentials, readCredentialRow, saveCredentials } from '@/lib/erp/data'
import {
  PROVIDER_FIELDS, fieldApplies, isConnectorProvider, missingSecrets, secretKeys, validateConfig,
} from '@/lib/erp/fields'
import { SsrfError, assertPublicHttpsUrl } from '@/lib/erp/ssrf'

export const dynamic = 'force-dynamic'

const NO_KEY = 'Credential storage is not configured on this server: set ERP_ENCRYPTION_KEY (32 bytes, base64) and redeploy.'

export async function GET() {
  const caller = await resolveCaller(['admin'])
  if (caller instanceof NextResponse) return caller
  const { orgId, admin } = caller

  let conn = await admin.from('erp_connections')
    .select('provider, is_active, config, updated_at, last_test_at, last_test_ok, last_test_message')
    .eq('organisation_id', orgId).maybeSingle()
  let schemaReady = true
  if (conn.error) {
    // Pre-w7-02: the last_test_* columns don't exist yet.
    schemaReady = false
    conn = await admin.from('erp_connections').select('provider, is_active, config, updated_at')
      .eq('organisation_id', orgId).maybeSingle() as typeof conn
    if (conn.error) return NextResponse.json({ error: 'ERP integration is unavailable — run procurement-08-erp.sql' }, { status: 503 })
  }

  let credentials: { provider: string; hints: Record<string, unknown> } | null = null
  try {
    const row = await readCredentialRow(admin, orgId)
    if (row) credentials = { provider: row.provider, hints: row.hints ?? {} } // ciphertext deliberately dropped
  } catch {
    schemaReady = false
  }

  return NextResponse.json({
    connection: conn.data ?? null,
    credentials,
    encryptionConfigured: !!getErpEncryptionKey(),
    schemaReady,
  })
}

export async function PUT(req: NextRequest) {
  const caller = await resolveCaller(['admin'])
  if (caller instanceof NextResponse) return caller
  const { orgId, admin, userId } = caller

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const provider = typeof body.provider === 'string' ? body.provider : ''
  const isActive = body.is_active === true
  if (provider !== 'none' && !isConnectorProvider(provider)) {
    return NextResponse.json({ error: 'Unknown provider' }, { status: 400 })
  }

  const now = new Date().toISOString()

  if (provider === 'none') {
    const { error } = await admin.from('erp_connections').upsert(
      { organisation_id: orgId, provider: 'none', is_active: isActive, config: {}, updated_at: now },
      { onConflict: 'organisation_id' })
    if (error) return NextResponse.json({ error: 'Failed to save the connection' }, { status: 500 })
    // Leaving a live provider: don't keep its secrets around.
    await deleteCredentials(admin, orgId).catch(() => {})
    return NextResponse.json({ ok: true })
  }

  const v = validateConfig(provider, body.config)
  if (!v.ok) return NextResponse.json({ error: v.errors.join('; ') }, { status: 400 })
  const config = v.config

  // SSRF: every user-supplied URL must be https and resolve only to public addresses.
  for (const f of PROVIDER_FIELDS[provider]) {
    if (f.kind !== 'url' || !config[f.key]) continue
    try { await assertPublicHttpsUrl(config[f.key]) } catch (e) {
      const msg = e instanceof SsrfError ? e.message : 'URL could not be checked'
      return NextResponse.json({ error: `${f.en}: ${msg}` }, { status: 400 })
    }
  }

  // Only the secret fields this provider (and its current auth mode) actually uses.
  const applicable = PROVIDER_FIELDS[provider].filter(f => f.secret && fieldApplies(f, config)).map(f => f.key)
  const rawSecrets = body.secrets && typeof body.secrets === 'object' ? (body.secrets as Record<string, unknown>) : {}
  const incoming: Record<string, string> = {}
  for (const k of applicable) {
    const val = rawSecrets[k]
    if (typeof val === 'string' && val.trim()) {
      if (val.length > 4000) return NextResponse.json({ error: 'A credential value is too long' }, { status: 400 })
      incoming[k] = val.trim()
    }
  }

  const key = getErpEncryptionKey()
  if (Object.keys(incoming).length && !key) return NextResponse.json({ error: NO_KEY, code: 'encryption_not_configured' }, { status: 501 })

  let existingRow
  try { existingRow = await readCredentialRow(admin, orgId) } catch {
    if (Object.keys(incoming).length || isActive) {
      return NextResponse.json({ error: 'Credential storage is unavailable — run w7-02-erp-connectors.sql' }, { status: 503 })
    }
    existingRow = null
  }

  // Merge: blank fields keep what is stored (same provider only).
  let merged: Record<string, string> = {}
  if (existingRow && existingRow.provider === provider && key) {
    try { merged = decryptSecrets(existingRow.ciphertext, key, credentialAad(orgId, provider)) } catch { merged = {} }
  }
  const known = new Set(secretKeys(provider))
  merged = Object.fromEntries(Object.entries({ ...merged, ...incoming }).filter(([k]) => known.has(k) && applicable.includes(k)))

  if (isActive) {
    if (!key) return NextResponse.json({ error: NO_KEY, code: 'encryption_not_configured' }, { status: 501 })
    const missing = missingSecrets(provider, config, merged)
    if (missing.length) {
      const names = PROVIDER_FIELDS[provider].filter(f => missing.includes(f.key)).map(f => f.en)
      return NextResponse.json({ error: `Enter ${names.join(', ')} before enabling the connection` }, { status: 400 })
    }
  }

  try {
    const providerChanged = !!existingRow && existingRow.provider !== provider
    if (key && Object.keys(merged).length && (Object.keys(incoming).length || !providerChanged)) {
      // New values, or a re-encrypt that drops secrets the current auth mode no longer uses.
      await saveCredentials(admin, orgId, provider, merged, key, userId)
    } else if (providerChanged) {
      // Switched provider without entering its secrets: the old provider's are useless.
      await deleteCredentials(admin, orgId)
    }
  } catch {
    return NextResponse.json({ error: 'Failed to store credentials — has w7-02-erp-connectors.sql been run?' }, { status: 500 })
  }

  const { error } = await admin.from('erp_connections').upsert(
    { organisation_id: orgId, provider, is_active: isActive, config, updated_at: now },
    { onConflict: 'organisation_id' })
  if (error) return NextResponse.json({ error: 'Failed to save the connection' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
