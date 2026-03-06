import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/require-auth'

interface RouteContext {
  params: Promise<{ id: string }>
}

const INVENTORY_PATCH_FIELDS = [
  'description', 'brand', 'machine_id', 'serial_number', 'product_code',
  'location', 'pallet_location', 'uom', 'item_class', 'condition',
  'client_id', 'end_customer_ref', 'inwards_date', 'outwards_date',
  'notes', 'quantity', 'is_active',
]

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const supabase = await createClient()

  try {
    const body = await request.json()
    const update = Object.fromEntries(
      Object.entries(body).filter(([k]) => INVENTORY_PATCH_FIELDS.includes(k))
    )

    const { data, error } = await supabase
      .from('inventory')
      .update(update)
      .eq('id', id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  } catch (err) {
    console.error(`PATCH /api/inventory/${id} error:`, err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
