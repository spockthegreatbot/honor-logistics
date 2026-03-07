import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/require-auth'
import { sendTelegramAlert } from '@/lib/telegram'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const supabase = await createClient()

  try {
    const body = await request.json()
    const { outwards_date, receiver, notes } = body

    const date = outwards_date || new Date().toISOString().split('T')[0]

    // Get the inventory item first
    const { data: item, error: fetchError } = await supabase
      .from('inventory')
      .select('serial_number, product_code, pallet_location, quantity')
      .eq('id', id)
      .single()

    if (fetchError || !item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    }

    // Update inventory
    const { data, error: updateError } = await supabase
      .from('inventory')
      .update({
        outwards_date: date,
        is_active: false,
      })
      .eq('id', id)
      .select()
      .single()

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

    // Create outwards movement
    const { error: movError } = await supabase.from('warehouse_movements').insert({
      movement_type: 'outwards',
      serial_number: item.serial_number,
      product_code: item.product_code,
      pallet_location: item.pallet_location,
      receiver_name: receiver || null,
      quantity: item.quantity || 1,
      movement_date: date,
      notes: notes || null,
    })

    if (movError) console.error('Movement insert error:', movError)

    // Auto-create delivery job
    const maxJobRow = await supabase.from("jobs").select("job_number").like("job_number","HRL-%").order("job_number",{ascending:false}).limit(1).single(); const lastNum = maxJobRow.data?.job_number ? parseInt(maxJobRow.data.job_number.split("-").pop() || "0") : 0; const jobNumber = `HRL-${new Date().getFullYear()}-${String(lastNum + 1).padStart(4,"0")}`
    const { data: newJob, error: jobError } = await supabase.from('jobs').insert({
      job_number: jobNumber,
      job_type: 'delivery',
      status: 'new',
      serial_number: item.serial_number,
      notes: `Auto-created from outwards: ${item.serial_number}${receiver ? ` → ${receiver}` : ''}${notes ? ` | ${notes}` : ''}`,
      scheduled_date: null,
      machine_id: null,
      client_id: null,
      end_customer_id: null,
      assigned_to: null,
      billing_cycle_id: null,
      po_number: null,
      email_source_id: null,
      completed_at: null,
    }).select('job_number, id').single()

    if (jobError) console.error('Auto-job creation failed:', jobError)

    // Fire-and-forget Telegram alert
    sendTelegramAlert(
      `📦 *Delivery job created*\nJob: \`${jobNumber}\`\nSerial: ${item.serial_number}${receiver ? `\nTo: ${receiver}` : ''}\nStatus: Unscheduled — assign date in Kanban`
    ).catch(console.error)

    return NextResponse.json({ data, auto_job: newJob ?? null })
  } catch (err) {
    console.error(`POST /api/inventory/${id}/outwards error:`, err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
