import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/require-auth'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const supabase = await createClient()

  // Block edits on invoiced cycles
  const { data: cycleCheck } = await supabase
    .from('billing_cycles')
    .select('status')
    .eq('id', id)
    .single()
  if (cycleCheck?.status === 'invoiced') {
    return NextResponse.json(
      { error: 'Billing cycle is invoiced — contact admin to unlock' },
      { status: 403 }
    )
  }

  try {
    const body = await request.json()
    const { job_ids } = body

    if (!job_ids || !Array.isArray(job_ids) || job_ids.length === 0) {
      return NextResponse.json({ error: 'job_ids array required' }, { status: 400 })
    }

    // Assign jobs to this billing cycle
    const { data, error } = await supabase
      .from('jobs')
      .update({ billing_cycle_id: id })
      .in('id', job_ids)
      .select()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ data, added: data?.length ?? 0 })
  } catch (err) {
    console.error(`POST /api/billing/${id}/jobs error:`, err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// GET available jobs (complete, not yet in a billing cycle for this client)
export async function GET(request: NextRequest, { params }: RouteContext) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const supabase = await createClient()

  // Get cycle to find client_id
  const { data: cycle } = await supabase
    .from('billing_cycles')
    .select('client_id')
    .eq('id', id)
    .single()

  if (!cycle) return NextResponse.json({ error: 'Cycle not found' }, { status: 404 })

  const { data: jobs } = await supabase
    .from('jobs')
    .select('*, clients(id, name), end_customers(id, name), machines(id, model), runup_details(*), delivery_details(*), install_details(*), toner_orders(*)')
    .eq('client_id', cycle.client_id)
    .in('status', ['complete', 'dispatched'])
    .is('billing_cycle_id', null)
    .order('scheduled_date', { ascending: false })

  return NextResponse.json({ data: jobs ?? [] })
}
