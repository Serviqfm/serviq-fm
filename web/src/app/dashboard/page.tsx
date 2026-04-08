import { createServerSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div style={{ padding: '2rem' }}>
      <h1>Serviq FM Dashboard</h1>
      <p>Logged in as: {user.email}</p>
    </div>
  )
}