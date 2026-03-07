import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/require-auth'

export async function GET() {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createClient()

  const [{ data: clients }, { data: endCustomers }, { data: staff }] = await Promise.all([
    supabase.from('clients').select('id, name').order('name'),
    supabase.from('end_customers').select('id, name').order('name'),
    supabase.from('staff').select('id, name').eq('is_active', true).order('name'),
  ])

  return NextResponse.json({
    clients: clients ?? [],
    end_customers: endCustomers ?? [],
    staff: staff ?? [],
  })
}
