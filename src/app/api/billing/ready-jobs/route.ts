import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/require-auth'
import { CURRENT_FY } from '@/lib/constants'

export async function GET(request: NextRequest) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createClient()
  const { searchParams } = new URL(request.url)

  const clientId = searchParams.get('client_id')
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  if (!clientId) {
    return NextResponse.json({ error: 'client_id is required' }, { status: 400 })
  }

  // Build query for jobs ready to be invoiced
  let query = supabase
    .from('jobs')
    .select(`
      id, job_number, job_type, status, scheduled_date, created_at,
      serial_number, order_types, notes, client_reference,
      client_id,
      clients(id, name, color_code),
      end_customers(id, name),
      machines(id, model, make),
      runup_details(unit_price),
      install_details(unit_price),
      delivery_details(base_price, fuel_surcharge_amt, fuel_override, subtype),
      toner_orders(total_price)
    `)
    .eq('client_id', clientId)
    // Not already in a billing cycle
    .is('billing_cycle_id', null)
    // Include all actionable statuses — Onur decides what to bill
    .in('status', ['done', 'delivered', 'complete', 'scheduled', 'ready', 'dispatched', 'in_transit', 'runup_complete'])
    .order('scheduled_date', { ascending: true, nullsFirst: false })

  // Date range filter
  if (from) {
    query = query.or(`scheduled_date.gte.${from},created_at.gte.${from}T00:00:00`)
  }
  if (to) {
    query = query.or(`scheduled_date.lte.${to},created_at.lte.${to}T23:59:59`)
  }

  const { data: jobs, error: jobsError } = await query

  if (jobsError) {
    return NextResponse.json({ error: jobsError.message }, { status: 500 })
  }

  // Fetch pricing rules for auto-fill
  const { data: pricingRules } = await supabase
    .from('pricing_rules')
    .select('*')
    .eq('financial_year', CURRENT_FY)
    .eq('is_active', true)

  // Enrich jobs with auto-pricing
  const enrichedJobs = (jobs ?? []).map((job) => {
    const jobType = job.job_type ?? ''
    let autoPrice: number | null = null
    let autoPriceSource: string | null = null

    // Try to get price from job's own detail tables first
    const runupArr = Array.isArray(job.runup_details) ? job.runup_details : []
    const installArr = Array.isArray(job.install_details) ? job.install_details : []
    const deliveryArr = Array.isArray(job.delivery_details) ? job.delivery_details : []
    const tonerArr = Array.isArray(job.toner_orders) ? job.toner_orders : []

    if (jobType === 'runup' && runupArr.length > 0 && runupArr[0]?.unit_price) {
      autoPrice = Number(runupArr[0].unit_price)
      autoPriceSource = 'job_detail'
    } else if (jobType === 'install' && installArr.length > 0 && installArr[0]?.unit_price) {
      autoPrice = Number(installArr[0].unit_price)
      autoPriceSource = 'job_detail'
    } else if (['delivery', 'collection', 'inwards', 'outwards'].includes(jobType) && deliveryArr.length > 0 && deliveryArr[0]?.base_price) {
      autoPrice = Number(deliveryArr[0].base_price)
      autoPriceSource = 'job_detail'
    } else if (jobType === 'toner_ship' && tonerArr.length > 0 && tonerArr[0]?.total_price) {
      autoPrice = Number(tonerArr[0].total_price)
      autoPriceSource = 'job_detail'
    }

    // Fallback to pricing rules if no job-level price
    if (autoPrice === null && pricingRules) {
      const matchingRule = pricingRules.find(
        (rule) => rule.job_type === jobType
      )
      if (matchingRule) {
        autoPrice = Number(matchingRule.unit_price)
        autoPriceSource = 'pricing_rule'
      }
    }

    // Get fuel surcharge from delivery details
    let fuelSurcharge: number | null = null
    if (['delivery', 'collection', 'inwards', 'outwards'].includes(jobType) && deliveryArr.length > 0) {
      const detail = deliveryArr[0] as { fuel_override?: boolean; fuel_surcharge_amt?: number }
      if (!detail.fuel_override && detail.fuel_surcharge_amt) {
        fuelSurcharge = Number(detail.fuel_surcharge_amt)
      }
    }

    return {
      ...job,
      auto_price: autoPrice,
      auto_price_source: autoPriceSource,
      fuel_surcharge: fuelSurcharge,
    }
  })

  return NextResponse.json({
    jobs: enrichedJobs,
    pricing_rules: pricingRules ?? [],
  })
}
