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
  'status', 'assigned_to', 'scheduled_date', 'notes', 'po_number',
  'billing_cycle_id', 'completed_at',
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

    const update = Object.fromEntries(
      Object.entries(body).filter(([k]) => JOB_PATCH_FIELDS.includes(k))
    )

    const { data: job, error } = await supabase
      .from('jobs')
      .update({ ...update, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*, clients(name), end_customers(name), staff:assigned_to(name), runup_details(*)')
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
      .select('*, clients(name), end_customers(name), staff:assigned_to(name), runup_details(*)')
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
