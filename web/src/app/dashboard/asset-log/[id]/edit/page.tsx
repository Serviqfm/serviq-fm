import { notFound } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import ItemForm from '../../ItemForm'

export const dynamic = 'force-dynamic'

export default async function EditAssetLogItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  // RLS scopes this SELECT to the caller's org — a foreign id returns no row.
  const { data: item } = await supabase.from('asset_log_items').select('*').eq('id', id).maybeSingle()
  if (!item) notFound()
  return <ItemForm mode='edit' itemId={id} initial={item} />
}
