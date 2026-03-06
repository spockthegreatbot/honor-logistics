import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/require-auth'

interface RouteContext {
  params: Promise<{ id: string }>
}

const BILLING_PATCH_FIELDS = [
  'status', 'cycle_name', 'period_start', 'period_end', 'financial_year',
  'discount_amount', 'notes', 'grand_total', 'subtotal', 'gst_amount',
  'total_runup', 'total_delivery', 'total_fuel_surcharge', 'total_install',
  'total_storage', 'total_toner', 'total_inwards_outwards',
]

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const supabase = await createClient()

  try {
    const body = await request.json()
    const update = Object.fromEntries(
      Object.entries(body).filter(([k]) => BILLING_PATCH_FIELDS.includes(k))
    )

    const { data, error } = await supabase
      .from('billing_cycles')
      .update(update)
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
