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
      contact_name, contact_phone, address_to, address_from,
      machine_model,
      serial_number, order_types, notes, client_reference,
      special_instructions, pickup_model, pickup_serial,
      po_number, tracking_number,
      client_id, booking_form_url, install_pdf_url,
      clients(id, name, color_code, billing_cycle_frequency),
      end_customers(id, name)
    `)
    .eq('client_id', clientId)
    // Not already in a billing cycle
    .is('billing_cycle_id', null)
    // Include ALL statuses except cancelled — Onur decides what to bill
    .not('status', 'in', '(cancelled)')
    // Exclude toner jobs (billed separately)
    .neq('job_type', 'toner')
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

  // Enrich jobs with auto-pricing from order_types mapped to pricing rules
  const enrichedJobs = (jobs ?? []).map((job) => {
    const jobType = job.job_type ?? ''
    const orderTypes: string[] = Array.isArray(job.order_types)
      ? job.order_types
      : typeof job.order_types === 'string'
        ? JSON.parse(job.order_types || '[]')
        : []
    let autoPrice: number | null = null
    let autoPriceSource: string | null = null

    // Match pricing rules by order_types first, then job_type
    if (pricingRules) {
      const typesToCheck = orderTypes.length > 0 ? orderTypes : [jobType]
      for (const t of typesToCheck) {
        const matchingRule = pricingRules.find(
          (rule) => rule.job_type === t
        )
        if (matchingRule) {
          // Sum prices if multiple order types
          if (autoPrice === null) autoPrice = 0
          autoPrice += Number(matchingRule.unit_price)
          autoPriceSource = 'pricing_rule'
        }
      }
    }

    // Fuel surcharge: use a flat rate for delivery-type jobs
    let fuelSurcharge: number | null = null
    if (['delivery', 'collection', 'inwards', 'outwards'].includes(jobType)) {
      // Will be summed at the invoice level; individual items get 0
      fuelSurcharge = 0
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
