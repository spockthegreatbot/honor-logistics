import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/require-auth'

interface RouteContext {
  params: Promise<{ id: string }>
}

const TONER_PATCH_FIELDS = [
  'status', 'courier', 'tracking_number', 'dispatch_date',
  'est_delivery', 'weight_kg', 'total_price', 'efex_ni', 'items',
]

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const supabase = await createClient()

  try {
    const body = await request.json()
    const update = Object.fromEntries(
      Object.entries(body).filter(([k]) => TONER_PATCH_FIELDS.includes(k))
    )

    const { data, error } = await supabase
      .from('toner_orders')
      .update(update)
      .eq('id', id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  } catch (err) {
    console.error(`PATCH /api/toner/${id} error:`, err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
