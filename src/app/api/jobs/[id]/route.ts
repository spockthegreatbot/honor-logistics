import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendTelegramAlert } from '@/lib/telegram'
import { requireAuth } from '@/lib/require-auth'

const statusEmoji: Record<string, string> = {
  pending: '📋', new: '📋', runup_pending: '🔧', runup_complete: '✅',
  ready: '📋', dispatched: '🚚', in_transit: '🚚', complete: '✅',
  completed: '✅', invoiced: '✅', cancelled: '❌',
}

const JOB_PATCH_FIELDS = [
  'status', 'assigned_to', 'scheduled_date', 'notes', 'po_number', 'client_id', 'end_customer_id',
  'billing_cycle_id', 'completed_at', 'client_reference', 'parent_job_id',
  // EFEX order fields
  'order_types', 'contact_name', 'contact_phone', 'scheduled_time', 'machine_accessories',
  'install_idca', 'address_to', 'address_from', 'stair_walker', 'stair_walker_comment',
  'parking', 'parking_comment', 'pickup_model', 'pickup_accessories', 'pickup_serial',
  'pickup_disposition', 'special_instructions', 'has_aod', 'aod_pdf_url', 'aod_signed_at',
  'serial_number', 'job_type', 'machine_model',
]

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const supabase = await createClient()
    const { id } = await params
    const body = await request.json()

    // Check if job belongs to an invoiced billing cycle
    const { data: jobCheck } = await supabase
      .from('jobs')
      .select('billing_cycle_id')
      .eq('id', id)
      .single()
    if (jobCheck?.billing_cycle_id) {
      const { data: cycle } = await supabase
        .from('billing_cycles')
        .select('status')
        .eq('id', jobCheck.billing_cycle_id)
        .single()
      if (cycle?.status === 'invoiced') {
        return NextResponse.json(
          { error: 'Billing cycle is invoiced — contact admin to unlock' },
          { status: 423 }
        )
      }
    }

    const update = Object.fromEntries(
      Object.entries(body).filter(([k]) => JOB_PATCH_FIELDS.includes(k))
    )

    const { data: job, error } = await supabase
      .from('jobs')
      .update({ ...update, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*, clients(name), end_customers(name, address, contact_name, contact_phone), staff:assigned_to(name), machines(model, make, machine_type), runup_details(*), delivery_details(*), install_details(*)')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Send Telegram alert on status change
    if (update.status && job) {
      const emoji = statusEmoji[update.status as string] ?? '📋'
      const custName = (job as { end_customers?: { name: string } | null }).end_customers?.name ?? 'N/A'
      const jobNum = (job as { job_number?: string | null }).job_number ?? id
      sendTelegramAlert(
        `${emoji} *Job ${(update.status as string).replace(/_/g, ' ')}: ${jobNum}*\nCustomer: ${custName}`
      )
    }

    return NextResponse.json({ job })
  } catch (err) {
    console.error('PATCH /api/jobs/[id] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const supabase = await createClient()
    const { id } = await params

    const { data: job, error } = await supabase
      .from('jobs')
      .select('*, clients(name), end_customers(name, address, contact_name, contact_phone), staff:assigned_to(name), machines(model, make, machine_type), runup_details(*), delivery_details(*), install_details(*)')
      .eq('id', id)
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }

    return NextResponse.json({ job })
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
