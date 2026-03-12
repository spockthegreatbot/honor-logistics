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
  const clientRef = searchParams.get('client_reference')

  const showAll = searchParams.get('show_all') === '1'

  let query = supabase
    .from('jobs')
    .select(
      '*, clients(name, color_code), end_customers(name), staff:assigned_to(name), runup_details(check_signed_off)',
      { count: 'exact' }
    )
    .order('created_at', { ascending: false })

  if (clientId && clientId !== 'all') query = query.eq('client_id', clientId)
  if (clientRef) query = query.ilike('client_reference', `%${clientRef}%`)
  if (status && status !== 'all') {
    query = query.eq('status', status)
  } else if (!showAll) {
    // Default: exclude completed/invoiced/cancelled to show active jobs only
    query = query.not('status', 'in', '(complete,invoiced,cancelled)')
  }

  // Hide toner jobs from the main board — they appear on the Toner page only
  query = query.neq('job_type', 'toner')

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
      client_reference,
      // EFEX fields
      order_types,
      contact_name,
      contact_phone,
      scheduled_time,
      machine_accessories,
      install_idca,
      address_to,
      address_from,
      stair_walker,
      stair_walker_comment,
      parking,
      parking_comment,
      pickup_model,
      pickup_accessories,
      pickup_serial,
      pickup_disposition,
      special_instructions,
      has_aod,
    } = body

    if (!client_id) {
      return NextResponse.json({ error: 'client_id is required' }, { status: 400 })
    }

    // Derive job_type from order_types if it's an EFEX job
    const effectiveJobType = job_type || (order_types?.length > 0 ? order_types[0] : 'delivery')

    // Generate job number: HRL-YYYY-XXXX
    const now = new Date()
    const { count: jobCount } = await supabase.from('jobs').select('*', { count: 'exact', head: true })
    const seq = String((jobCount ?? 0) + 1).padStart(4, '0')
    const jobNumber = `HRL-${now.getFullYear()}-${seq}`

    const initialStatus = effectiveJobType === 'runup' ? 'runup_pending' : 'new'

    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .insert({
        job_number: jobNumber,
        job_type: effectiveJobType,
        status: initialStatus,
        client_id: client_id || null,
        end_customer_id: end_customer_id || null,
        serial_number: machine_serial || null,
        scheduled_date: scheduled_date || null,
        assigned_to: assigned_to || null,
        po_number: po_number || null,
        notes: notes || null,
        client_reference: client_reference || null,
        // EFEX fields
        order_types: order_types ?? [],
        contact_name: contact_name || null,
        contact_phone: contact_phone || null,
        scheduled_time: scheduled_time || null,
        machine_accessories: machine_accessories || null,
        install_idca: install_idca ?? null,
        address_to: address_to || null,
        address_from: address_from || null,
        stair_walker: stair_walker ?? null,
        stair_walker_comment: stair_walker_comment || null,
        parking: parking ?? null,
        parking_comment: parking_comment || null,
        pickup_model: pickup_model || null,
        pickup_accessories: pickup_accessories || null,
        pickup_serial: pickup_serial || null,
        pickup_disposition: pickup_disposition || null,
        special_instructions: special_instructions || null,
        has_aod: has_aod ?? false,
      })
      .select()
      .single()

    if (jobError) {
      console.error('Job creation error:', jobError)
      return NextResponse.json({ error: jobError.message }, { status: 500 })
    }

    // If runup job, create runup_details row
    if (effectiveJobType === 'runup' && job) {
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
      const orderLabel = order_types?.length ? order_types.join(' + ') : effectiveJobType
      sendTelegramAlert(
        `🆕 *New Job: ${jobNumber}*\nType: ${orderLabel}\nCustomer: ${custName}\nScheduled: ${scheduled_date || 'TBD'}\nAssigned: ${staffName}`
      )
    }

    return NextResponse.json({ job }, { status: 201 })
  } catch (err) {
    console.error('POST /api/jobs error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
