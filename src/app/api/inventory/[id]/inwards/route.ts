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
    const { inwards_date, sender, notes } = body

    const date = inwards_date || new Date().toISOString().split('T')[0]

    const { data: item, error: fetchError } = await supabase
      .from('inventory')
      .select('serial_number, product_code, pallet_location, quantity')
      .eq('id', id)
      .single()

    if (fetchError || !item) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

    const { data, error: updateError } = await supabase
      .from('inventory')
      .update({ inwards_date: date, is_active: true })
      .eq('id', id)
      .select()
      .single()

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

    await supabase.from('warehouse_movements').insert({
      movement_type: 'inwards',
      serial_number: item.serial_number,
      product_code: item.product_code,
      pallet_location: item.pallet_location,
      sender_name: sender || null,
      quantity: item.quantity || 1,
      movement_date: date,
      notes: notes || null,
    })

    const jobNumber = `HRL-${new Date().getFullYear()}-${Date.now().toString().slice(-5)}`
    const { data: newJob } = await supabase.from('jobs').insert({
      job_number: jobNumber,
      job_type: 'collection',
      status: 'new',
      serial_number: item.serial_number,
      notes: `Auto-created from inwards: ${item.serial_number}${sender ? ` from ${sender}` : ''}${notes ? ` | ${notes}` : ''}`,
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

    // Fire-and-forget Telegram alert
    sendTelegramAlert(
      `📥 *Collection job created*\nJob: \`${jobNumber}\`\nSerial: ${item.serial_number}${sender ? `\nFrom: ${sender}` : ''}\nStatus: Unscheduled — assign date in Kanban`
    ).catch(console.error)

    return NextResponse.json({ data, auto_job: newJob ?? null })
  } catch (err) {
    console.error(`POST /api/inventory/${id}/inwards error:`, err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
