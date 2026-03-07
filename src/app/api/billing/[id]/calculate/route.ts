import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/require-auth'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(_request: NextRequest, { params }: RouteContext) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const supabase = await createClient()

  // Check if cycle is invoiced
  const { data: cycleCheck } = await supabase
    .from('billing_cycles')
    .select('status')
    .eq('id', id)
    .single()
  if (cycleCheck?.status === 'invoiced') {
    return NextResponse.json(
      { error: 'Billing cycle is invoiced — contact admin to unlock' },
      { status: 423 }
    )
  }

  // Fetch all jobs in this cycle
  const { data: jobs } = await supabase
    .from('jobs')
    .select(`
      id, job_type,
      runup_details(unit_price),
      install_details(unit_price),
      delivery_details(base_price, fuel_surcharge_amt, fuel_override),
      toner_orders(total_price)
    `)
    .eq('billing_cycle_id', id)

  // Fetch storage weekly for this cycle
  const { data: storageRows } = await supabase
    .from('storage_weekly')
    .select('total_ex')
    .eq('billing_cycle_id', id)

  // Fetch current cycle for discount
  const { data: cycle } = await supabase
    .from('billing_cycles')
    .select('discount_amount')
    .eq('id', id)
    .single()

  let total_runup = 0
  let total_delivery = 0
  let total_fuel_surcharge = 0
  let total_install = 0
  let total_toner = 0

  for (const job of jobs ?? []) {
    // Supabase returns related rows as arrays — take first element for 1:1 relations
    const runupArr = Array.isArray(job.runup_details) ? job.runup_details : (job.runup_details ? [job.runup_details] : [])
    const installArr = Array.isArray(job.install_details) ? job.install_details : (job.install_details ? [job.install_details] : [])
    const deliveryArr = Array.isArray(job.delivery_details) ? job.delivery_details : (job.delivery_details ? [job.delivery_details] : [])
    const tonerArr = Array.isArray(job.toner_orders) ? job.toner_orders : []

    for (const runup of runupArr as { unit_price?: number }[]) {
      if (runup?.unit_price) total_runup += Number(runup.unit_price)
    }
    for (const install of installArr as { unit_price?: number }[]) {
      if (install?.unit_price) total_install += Number(install.unit_price)
    }
    for (const delivery of deliveryArr as { base_price?: number; fuel_surcharge_amt?: number; fuel_override?: boolean }[]) {
      if (delivery?.base_price) total_delivery += Number(delivery.base_price)
      if (delivery && !delivery.fuel_override && delivery.fuel_surcharge_amt) {
        total_fuel_surcharge += Number(delivery.fuel_surcharge_amt)
      }
    }
    for (const t of tonerArr as { total_price?: number }[]) {
      if (t.total_price) total_toner += Number(t.total_price)
    }
  }

  const total_storage = (storageRows ?? []).reduce((sum, r) => sum + Number(r.total_ex || 0), 0)
  const discount_amount = Number(cycle?.discount_amount || 0)
  // NOTE: total_toner is intentionally excluded from subtotal.
  // Toner order charges are already included inside the Storage + Misc weekly lines.
  // total_toner is stored for reference only (Toner tab display).
  const subtotal = total_runup + total_delivery + total_fuel_surcharge + total_install + total_storage
  const gst_amount = (subtotal - discount_amount) * 0.1
  const grand_total = subtotal - discount_amount + gst_amount

  const { data: updated, error } = await supabase
    .from('billing_cycles')
    .update({
      total_runup,
      total_delivery,
      total_fuel_surcharge,
      total_install,
      total_storage,
      total_toner,
      subtotal,
      gst_amount,
      grand_total,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    data: updated,
    totals: { total_runup, total_delivery, total_fuel_surcharge, total_install, total_storage, total_toner, subtotal, discount_amount, gst_amount, grand_total },
  })
}
