import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/require-auth'

export async function GET(request: NextRequest) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createClient()
  const { searchParams } = new URL(request.url)

  const movementType = searchParams.get('movement_type')
  const dateFrom = searchParams.get('date_from')
  const dateTo = searchParams.get('date_to')

  let query = supabase
    .from('warehouse_movements')
    .select('*', { count: 'exact' })
    .order('movement_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (movementType && movementType !== 'all') query = query.eq('movement_type', movementType)
  if (dateFrom) query = query.gte('movement_date', dateFrom)
  if (dateTo) query = query.lte('movement_date', dateTo)

  const { data, error, count } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [], count })
}
