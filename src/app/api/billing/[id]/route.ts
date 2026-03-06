import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { id } = await params
  const supabase = await createClient()

  // Get cycle with client
  const { data: cycle, error: cycleError } = await supabase
    .from('billing_cycles')
    .select('*, clients(id, name, billing_email)')
    .eq('id', id)
    .single()

  if (cycleError || !cycle) {
    return NextResponse.json({ error: 'Billing cycle not found' }, { status: 404 })
  }

  // Get all jobs in this cycle
  const { data: jobs } = await supabase
    .from('jobs')
    .select(`
      *,
      clients(id, name),
      end_customers(id, name),
      machines(id, model, make),
      runup_details(*),
      install_details(*),
      delivery_details(*),
      toner_orders(*)
    `)
    .eq('billing_cycle_id', id)
    .order('scheduled_date')

  // Get storage weekly rows
  const { data: storageWeekly } = await supabase
    .from('storage_weekly')
    .select('*')
    .eq('billing_cycle_id', id)
    .order('created_at')

  return NextResponse.json({
    data: {
      ...cycle,
      jobs: jobs ?? [],
      storage_weekly: storageWeekly ?? [],
    },
  })
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { id } = await params
  const supabase = await createClient()

  try {
    const body = await request.json()

    const { data, error } = await supabase
      .from('billing_cycles')
      .update(body)
      .eq('id', id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  } catch (err) {
    console.error(`PATCH /api/billing/${id} error:`, err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
