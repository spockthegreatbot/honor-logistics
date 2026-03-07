import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/require-auth'

export async function GET(request: NextRequest) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createClient()
  const { searchParams } = new URL(request.url)

  const clientId = searchParams.get('client_id')
  const status = searchParams.get('status')

  let query = supabase
    .from('billing_cycles')
    .select('*, clients(id, name, color_code)', { count: 'exact' })
    .order('created_at', { ascending: false })

  if (clientId && clientId !== 'all') query = query.eq('client_id', clientId)
  if (status && status !== 'all') query = query.eq('status', status)

  const { data, error, count } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [], count })
}

export async function POST(request: NextRequest) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createClient()

  try {
    const body = await request.json()
    const { client_id, cycle_name, period_start, period_end, financial_year } = body

    if (!client_id || !period_start || !period_end) {
      return NextResponse.json({ error: 'client_id, period_start, period_end required' }, { status: 400 })
    }

    // Check for duplicate billing cycle
    const { data: existing } = await supabase
      .from('billing_cycles')
      .select('id, cycle_name')
      .eq('client_id', client_id)
      .eq('period_start', period_start)
      .eq('period_end', period_end)
      .maybeSingle()
    if (existing) {
      return NextResponse.json(
        { error: `Billing cycle already exists: "${existing.cycle_name}" (${existing.id})` },
        { status: 409 }
      )
    }

    const { data, error } = await supabase
      .from('billing_cycles')
      .insert({
        client_id,
        cycle_name: cycle_name || null,
        period_start,
        period_end,
        financial_year: financial_year || null,
        status: 'open',
        discount_amount: 0,
        total_runup: 0,
        total_delivery: 0,
        total_fuel_surcharge: 0,
        total_install: 0,
        total_storage: 0,
        total_toner: 0,
        total_inwards_outwards: 0,
        subtotal: 0,
        gst_amount: 0,
        grand_total: 0,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    console.error('POST /api/billing error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
