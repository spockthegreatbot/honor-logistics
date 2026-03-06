import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)

  const clientId = searchParams.get('client_id')
  const itemClass = searchParams.get('item_class')
  const condition = searchParams.get('condition')
  const search = searchParams.get('search')
  const activeOnly = searchParams.get('active') !== 'false'

  let query = supabase
    .from('inventory')
    .select('*, clients(id, name)', { count: 'exact' })
    .order('inwards_date', { ascending: false })

  if (activeOnly) query = query.eq('is_active', true)
  if (clientId && clientId !== 'all') query = query.eq('client_id', clientId)
  if (itemClass && itemClass !== 'all') query = query.eq('item_class', itemClass)
  if (condition && condition !== 'all') query = query.eq('condition', condition)
  if (search) {
    query = query.or(
      `serial_number.ilike.%${search}%,description.ilike.%${search}%,product_code.ilike.%${search}%,brand.ilike.%${search}%`
    )
  }

  const { data, error, count } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Compute days_in_storage
  const today = new Date()
  const items = (data ?? []).map((item) => {
    let days_in_storage: number | null = null
    if (item.inwards_date) {
      const inwards = new Date(item.inwards_date)
      days_in_storage = Math.floor((today.getTime() - inwards.getTime()) / (1000 * 60 * 60 * 24))
    }
    return { ...item, days_in_storage }
  })

  return NextResponse.json({ data: items, count })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  try {
    const body = await request.json()
    const {
      description,
      brand,
      machine_id,
      serial_number,
      product_code,
      location,
      pallet_location,
      uom,
      item_class,
      condition,
      client_id,
      end_customer_ref,
      inwards_date,
      notes,
      quantity,
    } = body

    if (!description) {
      return NextResponse.json({ error: 'description is required' }, { status: 400 })
    }

    // Insert inventory item
    const { data: item, error: itemError } = await supabase
      .from('inventory')
      .insert({
        description,
        brand: brand || null,
        machine_id: machine_id || null,
        serial_number: serial_number || null,
        product_code: product_code || null,
        location: location || null,
        pallet_location: pallet_location || null,
        uom: uom || null,
        item_class: item_class || null,
        condition: condition || 'new',
        client_id: client_id || null,
        end_customer_ref: end_customer_ref || null,
        inwards_date: inwards_date || new Date().toISOString().split('T')[0],
        notes: notes || null,
        quantity: quantity || 1,
        is_active: true,
      })
      .select()
      .single()

    if (itemError) return NextResponse.json({ error: itemError.message }, { status: 500 })

    // Create warehouse movement (inwards)
    const { error: movError } = await supabase.from('warehouse_movements').insert({
      movement_type: 'inwards',
      serial_number: serial_number || null,
      product_code: product_code || null,
      pallet_location: pallet_location || null,
      condition: condition || null,
      quantity: quantity || 1,
      movement_date: inwards_date || new Date().toISOString().split('T')[0],
      notes: notes || null,
    })

    if (movError) console.error('Movement insert error:', movError)

    return NextResponse.json({ data: item }, { status: 201 })
  } catch (err) {
    console.error('POST /api/inventory error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
