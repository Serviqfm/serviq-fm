// web/scripts/seed-field-configs.ts
// Usage: cd web && npx tsx scripts/seed-field-configs.ts
// Requires SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL in env.

import { createClient } from '@supabase/supabase-js'
import { FIELD_CATALOG, FieldVisibility } from '../src/lib/field-catalog'

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env')
    process.exit(1)
  }
  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: orgs, error: orgsErr } = await supabase
    .from('organisations')
    .select('id, name')
  if (orgsErr) {
    console.error('Failed to fetch organisations:', orgsErr.message)
    process.exit(1)
  }
  console.log(`Found ${orgs?.length ?? 0} organisations`)

  for (const org of orgs ?? []) {
    const rows: { organisation_id: string; page: string; field_key: string; visibility: FieldVisibility }[] = []
    for (const [page, fields] of Object.entries(FIELD_CATALOG)) {
      for (const meta of fields) {
        rows.push({
          organisation_id: org.id,
          page,
          field_key: meta.key,
          visibility: meta.is_system_required ? 'required' : meta.default_visibility,
        })
      }
    }
    if (rows.length === 0) continue
    const { error } = await supabase
      .from('field_configs')
      .upsert(rows, { onConflict: 'organisation_id,page,field_key', ignoreDuplicates: true })
    if (error) {
      console.error(`Failed for org ${org.id} (${org.name}):`, error.message)
    } else {
      console.log(`✓ Seeded ${rows.length} rows for ${org.name}`)
    }
  }
  console.log('Done.')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
