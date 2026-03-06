import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id } = await params
  const supabase = await createClient()

  try {
    const body = await request.json()
    const { outwards_date, receiver, notes } = body

    const date = outwards_date || new Date().toISOString().split('T')[0]

    // Get the inventory item first
    const { data: item, error: fetchError } = await supabase
      .from('inventory')
      .select('serial_number, product_code, pallet_location, quantity')
      .eq('id', id)
      .single()

    if (fetchError || !item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    }

    // Update inventory
    const { data, error: updateError } = await supabase
      .from('inventory')
      .update({
        outwards_date: date,
        is_active: false,
      })
      .eq('id', id)
      .select()
      .single()

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

    // Create outwards movement
    const { error: movError } = await supabase.from('warehouse_movements').insert({
      movement_type: 'outwards',
      serial_number: item.serial_number,
      product_code: item.product_code,
      pallet_location: item.pallet_location,
      receiver_name: receiver || null,
      quantity: item.quantity || 1,
      movement_date: date,
      notes: notes || null,
    })

    if (movError) console.error('Movement insert error:', movError)

    return NextResponse.json({ data })
  } catch (err) {
    console.error(`POST /api/inventory/${id}/outwards error:`, err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
