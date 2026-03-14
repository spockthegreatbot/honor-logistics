import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/require-auth'
import { GST_RATE } from '@/lib/constants'

interface LineItemInput {
  job_id?: string | null
  description: string
  qty: number
  price_ex: number
  fuel_surcharge?: number
  sheet_type?: string
  customer?: string
  model?: string
  serial?: string
  action?: string
  job_date?: string
}

interface GenerateInvoiceBody {
  client_id: string
  period_start: string
  period_end: string
  cycle_name?: string
  financial_year?: string
  fuel_surcharge_total?: number
  line_items: LineItemInput[]
}

function deriveFY(dateStr: string): string {
  const d = new Date(dateStr)
  const year = d.getFullYear()
  const month = d.getMonth() + 1
  return month >= 7 ? `${year}-${year + 1}` : `${year - 1}-${year}`
}

function generateCycleName(clientName: string, periodStart: string, periodEnd: string): string {
  const start = new Date(periodStart)
  const end = new Date(periodEnd)
  const fy = deriveFY(periodStart)
  const fyShort = `FY${fy.slice(2, 4)}-${fy.slice(7, 9)}`

  const upper = clientName.toUpperCase()

  // EFEX / Mitronics = biweekly — use week numbers
  if (upper.includes('EFEX') || upper.includes('MITRONICS')) {
    const getWeek = (d: Date) => {
      const onejan = new Date(d.getFullYear(), 0, 1)
      return Math.ceil((((d.getTime() - onejan.getTime()) / 86400000) + onejan.getDay() + 1) / 7)
    }
    const w1 = getWeek(start)
    const w2 = getWeek(end)
    return w1 === w2 ? `Week ${w1} ${fyShort}` : `Week ${w1}-${w2} ${fyShort}`
  }

  // Monthly clients — use month name
  const monthName = start.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })
  return `${monthName} ${fyShort}`
}

export async function POST(request: NextRequest) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createClient()

  try {
    const body: GenerateInvoiceBody = await request.json()
    const { client_id, period_start, period_end, line_items, fuel_surcharge_total } = body

    if (!client_id || !period_start || !period_end) {
      return NextResponse.json({ error: 'client_id, period_start, period_end required' }, { status: 400 })
    }

    if (!line_items || line_items.length === 0) {
      return NextResponse.json({ error: 'At least one line item is required' }, { status: 400 })
    }

    // Get client name for cycle name generation
    const { data: client } = await supabase
      .from('clients')
      .select('id, name')
      .eq('id', client_id)
      .single()

    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    const financialYear = body.financial_year || deriveFY(period_start)
    const cycleName = body.cycle_name || generateCycleName(client.name, period_start, period_end)

    // Calculate totals from line items
    const subtotal = line_items.reduce((sum, item) => {
      return sum + (item.qty * item.price_ex)
    }, 0)

    const fuelTotal = fuel_surcharge_total ?? line_items.reduce((sum, item) => {
      return sum + (item.fuel_surcharge ?? 0)
    }, 0)

    const taxableAmount = subtotal + fuelTotal
    const gstAmount = Math.round(taxableAmount * GST_RATE * 100) / 100
    const grandTotal = Math.round((taxableAmount + gstAmount) * 100) / 100

    // Categorize totals by sheet_type for the billing_cycle
    let totalRunup = 0, totalDelivery = 0, totalInstall = 0, totalFuelSurcharge = 0
    for (const item of line_items) {
      const total = item.qty * item.price_ex
      const type = item.sheet_type ?? ''
      if (type === 'runup') totalRunup += total
      else if (['delivery', 'inwards_outwards', 'collection'].includes(type)) totalDelivery += total
      else if (type === 'install') totalInstall += total
    }
    totalFuelSurcharge = fuelTotal

    // Create billing cycle
    const { data: cycle, error: cycleError } = await supabase
      .from('billing_cycles')
      .insert({
        client_id,
        cycle_name: cycleName,
        period_start,
        period_end,
        financial_year: financialYear,
        status: 'review',
        total_runup: Math.round(totalRunup * 100) / 100,
        total_delivery: Math.round(totalDelivery * 100) / 100,
        total_fuel_surcharge: Math.round(totalFuelSurcharge * 100) / 100,
        total_install: Math.round(totalInstall * 100) / 100,
        total_storage: 0,
        total_toner: 0,
        total_inwards_outwards: 0,
        discount_amount: 0,
        subtotal: Math.round(subtotal * 100) / 100,
        gst_amount: gstAmount,
        grand_total: grandTotal,
      })
      .select()
      .single()

    if (cycleError) {
      return NextResponse.json({ error: cycleError.message }, { status: 500 })
    }

    // Create billing line items
    const lineItemsToInsert = line_items.map((item) => ({
      billing_cycle_id: cycle.id,
      job_id: item.job_id || null,
      sheet_type: item.sheet_type || 'misc',
      job_date: item.job_date || null,
      customer: item.customer || null,
      model: item.model || null,
      serial: item.serial || null,
      action: item.action || item.description,
      qty: item.qty,
      price_ex: item.price_ex,
      fuel_surcharge: item.fuel_surcharge ?? 0,
      total_ex: Math.round(item.qty * item.price_ex * 100) / 100,
      notes: null,
    }))

    const { error: lineItemsError } = await supabase
      .from('billing_line_items')
      .insert(lineItemsToInsert)

    if (lineItemsError) {
      // Clean up the cycle if line items fail
      await supabase.from('billing_cycles').delete().eq('id', cycle.id)
      return NextResponse.json({ error: lineItemsError.message }, { status: 500 })
    }

    // Update jobs: set billing_cycle_id and status to 'invoiced'
    const jobIds = line_items
      .filter((item) => item.job_id)
      .map((item) => item.job_id as string)

    if (jobIds.length > 0) {
      const { error: updateError } = await supabase
        .from('jobs')
        .update({
          billing_cycle_id: cycle.id,
          status: 'invoiced',
        })
        .in('id', jobIds)

      if (updateError) {
        console.error('Failed to update jobs:', updateError.message)
        // Don't fail the whole request — cycle and line items are already created
      }
    }

    return NextResponse.json({
      billing_cycle_id: cycle.id,
      cycle_name: cycleName,
      line_items_count: lineItemsToInsert.length,
      jobs_updated: jobIds.length,
      totals: {
        subtotal: Math.round(subtotal * 100) / 100,
        fuel_surcharge: Math.round(fuelTotal * 100) / 100,
        gst: gstAmount,
        grand_total: grandTotal,
      },
    }, { status: 201 })
  } catch (err) {
    console.error('POST /api/billing/generate-invoice error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
