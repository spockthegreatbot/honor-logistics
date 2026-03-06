import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendTelegramAlert } from '@/lib/telegram'

const statusEmoji: Record<string, string> = {
  pending: '📋', new: '📋', runup_pending: '🔧', runup_complete: '✅',
  ready: '📋', dispatched: '🚚', in_transit: '🚚', complete: '✅',
  completed: '✅', invoiced: '✅', cancelled: '❌',
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { id } = await params
    const body = await request.json()

    const { data: job, error } = await supabase
      .from('jobs')
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*, clients(name), end_customers(name), staff:assigned_to(name), runup_details(*)')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Send Telegram alert on status change
    if (body.status && job) {
      const emoji = statusEmoji[body.status] ?? '📋'
      const custName = (job as { end_customers?: { name: string } | null }).end_customers?.name ?? 'N/A'
      const jobNum = (job as { job_number?: string | null }).job_number ?? id
      sendTelegramAlert(
        `${emoji} *Job ${body.status.replace(/_/g, ' ')}: ${jobNum}*\nCustomer: ${custName}`
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
