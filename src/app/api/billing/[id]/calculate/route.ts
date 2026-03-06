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
    const runup = job.runup_details as { unit_price?: number } | null
    const install = job.install_details as { unit_price?: number } | null
    const delivery = job.delivery_details as { base_price?: number; fuel_surcharge_amt?: number; fuel_override?: boolean } | null
    const toner = job.toner_orders as { total_price?: number }[] | null

    if (runup?.unit_price) total_runup += Number(runup.unit_price)
    if (install?.unit_price) total_install += Number(install.unit_price)
    if (delivery?.base_price) total_delivery += Number(delivery.base_price)
    if (delivery && !delivery.fuel_override && delivery.fuel_surcharge_amt) {
      total_fuel_surcharge += Number(delivery.fuel_surcharge_amt)
    }
    if (Array.isArray(toner)) {
      for (const t of toner) {
        if (t.total_price) total_toner += Number(t.total_price)
      }
    }
  }

  const total_storage = (storageRows ?? []).reduce((sum, r) => sum + Number(r.total_ex || 0), 0)
  const discount_amount = Number(cycle?.discount_amount || 0)
  const subtotal = total_runup + total_delivery + total_fuel_surcharge + total_install + total_storage + total_toner
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
