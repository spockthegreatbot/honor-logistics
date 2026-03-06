import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/require-auth'

export async function GET() {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('clients')
    .select('id, name')
    .order('name')
  if (error) return NextResponse.json([], { status: 500 })
  return NextResponse.json(data ?? [])
}
