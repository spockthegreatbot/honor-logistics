import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/require-auth'

export async function GET(request: NextRequest) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createClient()
  const { searchParams } = new URL(request.url)

  const courier = searchParams.get('courier')
  const status = searchParams.get('status')
  const dateFrom = searchParams.get('date_from')
  const dateTo = searchParams.get('date_to')
  const clientId = searchParams.get('client_id')

  let query = supabase
    .from('toner_orders')
    .select('*, jobs(id, client_id, clients(id, name))', { count: 'exact' })
    .order('created_at', { ascending: false })

  if (courier && courier !== 'all') query = query.eq('courier', courier)
  if (status && status !== 'all') query = query.eq('status', status)
  if (dateFrom) query = query.gte('dispatch_date', dateFrom)
  if (dateTo) query = query.lte('dispatch_date', dateTo)

  const { data, error, count } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Filter by client if needed (joins make this complex server-side)
  let filtered = data ?? []
  if (clientId && clientId !== 'all') {
    filtered = filtered.filter((o) => {
      const job = o.jobs as { client_id?: string } | null
      return job?.client_id === clientId
    })
  }

  return NextResponse.json({ data: filtered, count })
}

export async function POST(request: NextRequest) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createClient()

  try {
    const body = await request.json()
    const {
      client_id,
      courier,
      efex_ni,
      tracking_number,
      dispatch_date,
      est_delivery,
      weight_kg,
      total_price,
      items,
    } = body

    if (!courier) {
      return NextResponse.json({ error: 'courier is required' }, { status: 400 })
    }

    // Create job record first
    const jobNumber = `TN-${Date.now().toString(36).toUpperCase()}`
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .insert({
        job_number: jobNumber,
        job_type: 'toner_ship',
        status: 'dispatched',
        client_id: client_id || null,
        scheduled_date: dispatch_date || null,
        completed_at: dispatch_date ? new Date(dispatch_date).toISOString() : null,
        notes: `EFEX NI: ${efex_ni || 'N/A'}`,
      })
      .select()
      .single()

    if (jobError) return NextResponse.json({ error: jobError.message }, { status: 500 })

    // Create toner order
    const { data: order, error: orderError } = await supabase
      .from('toner_orders')
      .insert({
        job_id: job.id,
        courier,
        efex_ni: efex_ni || null,
        tracking_number: tracking_number || null,
        dispatch_date: dispatch_date || null,
        est_delivery: est_delivery || null,
        weight_kg: weight_kg || null,
        total_price: total_price || null,
        items: items || null,
        status: 'dispatched',
      })
      .select()
      .single()

    if (orderError) return NextResponse.json({ error: orderError.message }, { status: 500 })

    return NextResponse.json({ data: order }, { status: 201 })
  } catch (err) {
    console.error('POST /api/toner error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
