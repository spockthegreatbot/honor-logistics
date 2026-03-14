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
  const scope = searchParams.get('scope')

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

  // Schedule Board scope filtering
  if (scope) {
    const now = new Date()
    const todayStr = now.toISOString().slice(0, 10)

    const addDays = (d: Date, n: number) => {
      const r = new Date(d)
      r.setDate(r.getDate() + n)
      return r.toISOString().slice(0, 10)
    }

    const tomorrowStr = addDays(now, 1)

    switch (scope) {
      case 'today': {
        // Today's jobs + past 2 days grace window (unfinished) + in_transit
        const grace2 = addDays(now, -2)
        query = query.or(`scheduled_date.gte.${grace2},status.eq.in_transit`)
        query = query.lte('scheduled_date', todayStr)
        query = query.not('status', 'in', '(complete,done,invoiced,cancelled)')
        query = query.eq('archived', false)
        break
      }
      case 'tomorrow':
        query = query.eq('scheduled_date', tomorrowStr)
        query = query.not('status', 'in', '(complete,invoiced,cancelled)')
        query = query.eq('archived', false)
        break
      case 'week': {
        // Today+1 through today+7
        const weekEnd = addDays(now, 7)
        query = query.gte('scheduled_date', tomorrowStr)
        query = query.lte('scheduled_date', weekEnd)
        query = query.not('status', 'in', '(complete,invoiced,cancelled)')
        query = query.eq('archived', false)
        break
      }
      case 'next_week': {
        // Today+8 through today+14
        const nwStart = addDays(now, 8)
        const nwEnd = addDays(now, 14)
        query = query.gte('scheduled_date', nwStart)
        query = query.lte('scheduled_date', nwEnd)
        query = query.not('status', 'in', '(complete,invoiced,cancelled)')
        query = query.eq('archived', false)
        break
      }
      case 'unscheduled':
        query = query.is('scheduled_date', null)
        query = query.eq('archived', false)
        query = query.not('status', 'in', '(done,complete,invoiced,cancelled)')
        break
      case 'ready-to-bill':
      case 'ready_to_bill':
        // Include ALL completed jobs regardless of archived flag
        // Archived just means "off active board", not "already billed"
        query = query.in('status', ['done', 'delivered', 'complete'])
        query = query.is('billing_cycle_id', null)
        break
      case 'archived':
        query = query.eq('archived', true)
        query = query.order('scheduled_date', { ascending: false })
        query = query.range(0, 49) // Limit to 50 most recent archived jobs
        break
      default:
        // Unknown scope — fall through to default behavior
        break
    }
  } else {
    if (status && status !== 'all') {
      query = query.eq('status', status)
    } else if (!showAll) {
      // Default: exclude completed/invoiced/cancelled to show active jobs only
      query = query.not('status', 'in', '(complete,invoiced,cancelled)')
    }
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

    // Duplicate detection by client_reference
    if (client_reference) {
      const { data: existingByRef } = await supabase
        .from('jobs')
        .select('id')
        .eq('client_reference', client_reference)
        .eq('client_id', client_id)
        .limit(1)

      if (existingByRef && existingByRef.length > 0) {
        return NextResponse.json(
          { error: 'duplicate', existing_id: existingByRef[0].id },
          { status: 409 }
        )
      }
    }

    // Derive job_type from order_types if it's an EFEX job
    const effectiveJobType = job_type || (order_types?.length > 0 ? order_types[0] : 'delivery')

    // Generate job number: HRL-YYYY-XXXX
    const now = new Date()
    const { count: jobCount } = await supabase.from('jobs').select('*', { count: 'exact', head: true })
    const seq = String((jobCount ?? 0) + 1).padStart(4, '0')
    const jobNumber = `HRL-${now.getFullYear()}-${seq}`

    // Duplicate detection by job_number
    const { data: existingByNumber } = await supabase
      .from('jobs')
      .select('id')
      .eq('job_number', jobNumber)
      .limit(1)

    if (existingByNumber && existingByNumber.length > 0) {
      return NextResponse.json(
        { error: 'duplicate', existing_id: existingByNumber[0].id },
        { status: 409 }
      )
    }

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

    // Auto-attach to open billing cycle for this client
    if (job && client_id) {
      const { data: openCycle } = await supabase
        .from('billing_cycles')
        .select('id')
        .eq('client_id', client_id)
        .eq('status', 'open')
        .order('period_start', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (openCycle?.id) {
        await supabase
          .from('jobs')
          .update({ billing_cycle_id: openCycle.id })
          .eq('id', job.id)
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
