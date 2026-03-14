import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const CRON_SECRET = process.env.CRON_SECRET ?? 'honor-auto-open-2026'

function getFYLabel(date: Date): string {
  const year = date.getFullYear()
  const month = date.getMonth() // 0-indexed
  // FY starts July 1. If month >= 6 (July), FY is year-(year+1), else (year-1)-year
  if (month >= 6) {
    return `FY${String(year).slice(2)}-${String(year + 1).slice(2)}`
  }
  return `FY${String(year - 1).slice(2)}-${String(year).slice(2)}`
}

function getMonthCycleName(date: Date): string {
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December']
  return `${months[date.getMonth()]} ${getFYLabel(date)}`
}

function getBiweeklyCycleName(date: Date): string {
  // FY starts July 1
  const year = date.getFullYear()
  const month = date.getMonth()
  const fyStart = month >= 6
    ? new Date(year, 6, 1)      // July 1 of current year
    : new Date(year - 1, 6, 1)  // July 1 of previous year

  const daysSinceFYStart = Math.floor((date.getTime() - fyStart.getTime()) / (1000 * 60 * 60 * 24))
  const weekNum = Math.floor(daysSinceFYStart / 7) + 1
  const weekEnd = weekNum + 1

  return `Week ${weekNum}-${weekEnd} ${getFYLabel(date)}`
}

function getMonthPeriod(date: Date): { start: string; end: string } {
  const year = date.getFullYear()
  const month = date.getMonth()
  const start = new Date(year, month, 1)
  const end = new Date(year, month + 1, 0) // last day of month
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  }
}

function getBiweeklyPeriod(date: Date): { start: string; end: string } {
  const start = new Date(date)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 13)
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  }
}

export async function POST(request: NextRequest) {
  // Auth: either cron secret header or user auth
  const cronSecret = request.headers.get('x-cron-secret')
  if (cronSecret !== CRON_SECRET) {
    // If no cron secret, could check user auth, but for cron we just reject
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const supabase = createClient(supabaseUrl, serviceKey)

  const today = new Date()
  // Convert to AEST for date logic (UTC+10)
  const aestOffset = 10 * 60 * 60 * 1000
  const aestDate = new Date(today.getTime() + aestOffset)

  const { data: clients, error: clientErr } = await supabase
    .from('clients')
    .select('id, name, billing_cycle_frequency')
    .eq('is_billing_client', true)

  if (clientErr) {
    return NextResponse.json({ error: clientErr.message }, { status: 500 })
  }

  const created: Array<{ client: string; cycle_name: string; period_start: string; period_end: string }> = []
  const skipped: Array<{ client: string; reason: string }> = []

  for (const client of clients ?? []) {
    // Check for existing open cycle
    const { data: existing } = await supabase
      .from('billing_cycles')
      .select('id, cycle_name')
      .eq('client_id', client.id)
      .eq('status', 'open')
      .limit(1)
      .maybeSingle()

    if (existing) {
      skipped.push({ client: client.name, reason: `Already has open cycle: ${existing.cycle_name}` })
      continue
    }

    const freq = client.billing_cycle_frequency ?? 'monthly'
    let cycleName: string
    let period: { start: string; end: string }

    if (freq === 'biweekly') {
      cycleName = getBiweeklyCycleName(aestDate)
      period = getBiweeklyPeriod(aestDate)
    } else {
      cycleName = getMonthCycleName(aestDate)
      period = getMonthPeriod(aestDate)
    }

    const { error: insertErr } = await supabase
      .from('billing_cycles')
      .insert({
        client_id: client.id,
        cycle_name: cycleName,
        period_start: period.start,
        period_end: period.end,
        financial_year: getFYLabel(aestDate),
        status: 'open',
        discount_amount: 0,
        total_runup: 0,
        total_delivery: 0,
        total_fuel_surcharge: 0,
        total_install: 0,
        total_storage: 0,
        total_toner: 0,
        total_inwards_outwards: 0,
        subtotal: 0,
        gst_amount: 0,
        grand_total: 0,
      })

    if (insertErr) {
      skipped.push({ client: client.name, reason: `Insert error: ${insertErr.message}` })
    } else {
      created.push({
        client: client.name,
        cycle_name: cycleName,
        period_start: period.start,
        period_end: period.end,
      })
    }
  }

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    created,
    skipped,
    summary: `Created ${created.length} cycles, skipped ${skipped.length}`,
  })
}
