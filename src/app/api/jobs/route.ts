import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendTelegramAlert } from '@/lib/telegram'
import { requireAuth } from '@/lib/require-auth'

export async function GET(request: NextRequest) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createClient()
  const { searchParams } = new URL(request.url)
  const clientId = searchParams.get('client_id')
  const status = searchParams.get('status')

  const showAll = searchParams.get('show_all') === '1'

  let query = supabase
    .from('jobs')
    .select(
      '*, clients(name, color_code), end_customers(name), staff:assigned_to(name), runup_details(check_signed_off)',
      { count: 'exact' }
    )
    .order('created_at', { ascending: false })

  if (clientId && clientId !== 'all') query = query.eq('client_id', clientId)
  if (status && status !== 'all') {
    query = query.eq('status', status)
  } else if (!showAll) {
    // Default: exclude completed/invoiced/cancelled to show active jobs only
    query = query.not('status', 'in', '(complete,invoiced,cancelled)')
  }

  // Pagination safety
  query = query.range(0, 499)

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [], count })
}

export async function POST(request: Request) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const supabase = await createClient()
    const body = await request.json()

    const {
      job_type,
      client_id,
      end_customer_id,
      machine_model,
      machine_serial,
      scheduled_date,
      assigned_to,
      po_number,
      notes,
    } = body

    if (!job_type || !client_id) {
      return NextResponse.json({ error: 'job_type and client_id are required' }, { status: 400 })
    }

    // Generate job number
    const jobNumber = `HL-${Date.now().toString(36).toUpperCase()}`

    const initialStatus = job_type === 'runup' ? 'runup_pending' : 'new'

    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .insert({
        job_number: jobNumber,
        job_type,
        status: initialStatus,
        client_id: client_id || null,
        end_customer_id: end_customer_id || null,
        serial_number: machine_serial || null,
        scheduled_date: scheduled_date || null,
        assigned_to: assigned_to || null,
        po_number: po_number || null,
        notes: notes || null,
      })
      .select()
      .single()

    if (jobError) {
      console.error('Job creation error:', jobError)
      return NextResponse.json({ error: jobError.message }, { status: 500 })
    }

    // If runup job, create runup_details row
    if (job_type === 'runup' && job) {
      const { error: runupError } = await supabase
        .from('runup_details')
        .insert({
          job_id: job.id,
          check_power_on: false,
          check_firmware_loaded: false,
          check_customer_config: false,
          check_serial_verified: false,
          check_test_print: false,
          check_signed_off: false,
        })

      if (runupError) {
        console.error('Runup details creation error:', runupError)
        // Don't fail the whole request — job was created
      }
    }

    // Send Telegram alert for new job
    if (job) {
      const { data: details } = await supabase
        .from('jobs')
        .select('end_customers(name), staff:assigned_to(name)')
        .eq('id', job.id)
        .single()
      const d = details as unknown as { end_customers?: { name: string } | null; staff?: { name: string } | null } | null
      const custName = d?.end_customers?.name ?? 'N/A'
      const staffName = d?.staff?.name ?? 'Unassigned'
      sendTelegramAlert(
        `🆕 *New Job: ${jobNumber}*\nType: ${job_type}\nCustomer: ${custName}\nScheduled: ${scheduled_date || 'TBD'}\nAssigned: ${staffName}`
      )
    }

    return NextResponse.json({ job }, { status: 201 })
  } catch (err) {
    console.error('POST /api/jobs error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
