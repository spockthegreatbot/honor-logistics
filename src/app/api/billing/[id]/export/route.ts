import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/require-auth'
import * as XLSX from 'xlsx'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { searchParams } = new URL(request.url)
  const format = searchParams.get('format') ?? 'xlsx'
  const supabase = await createClient()

  // Fetch cycle
  const { data: cycle, error: cycleErr } = await supabase
    .from('billing_cycles')
    .select('*, clients(id, name)')
    .eq('id', id)
    .single()
  if (cycleErr || !cycle) {
    return NextResponse.json({ error: 'Billing cycle not found' }, { status: 404 })
  }

  // Fetch jobs with details
  const { data: jobs } = await supabase
    .from('jobs')
    .select(`
      *, clients(name), end_customers(name), machines(model),
      runup_details(*), install_details(*), delivery_details(*), toner_orders(*)
    `)
    .eq('billing_cycle_id', id)
    .order('scheduled_date')

  // Fetch storage
  const { data: storageWeekly } = await supabase
    .from('storage_weekly')
    .select('*')
    .eq('billing_cycle_id', id)
    .order('created_at')

  const allJobs = jobs ?? []
  const storage = storageWeekly ?? []

  const clientName = (cycle.clients as { name: string } | null)?.name ?? 'Client'
  const cycleName = cycle.cycle_name ?? `Cycle ${id.slice(0, 8)}`

  if (format === 'pdf') {
    return generatePDF(cycle, allJobs, storage, clientName, cycleName)
  }

  return generateXLSX(cycle, allJobs, storage, clientName, cycleName)
}

function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : v ? [v] : []
}

function generateXLSX(
  cycle: Record<string, unknown>,
  jobs: Record<string, unknown>[],
  storage: Record<string, unknown>[],
  clientName: string,
  cycleName: string,
) {
  const wb = XLSX.utils.book_new()

  // Run Ups tab
  const runups = jobs.filter((j) => j.job_type === 'runup')
  const runupData = runups.map((j) => {
    const d = arr(j.runup_details)[0] as Record<string, unknown> | undefined
    return {
      'Job #': j.job_number,
      'Date': j.scheduled_date,
      'Serial': j.serial_number,
      'Machine': (j.machines as { model?: string } | null)?.model ?? '',
      'Action': d?.action_type ?? '',
      'Unit Price': d?.unit_price ?? 0,
    }
  })
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(runupData.length ? runupData : [{}]), 'Run Ups')

  // Delivery tab
  const deliveries = jobs.filter((j) => j.job_type === 'delivery' || j.job_type === 'collection')
  const deliveryData = deliveries.map((j) => {
    const d = arr(j.delivery_details)[0] as Record<string, unknown> | undefined
    return {
      'Job #': j.job_number,
      'Date': j.scheduled_date,
      'Type': d?.subtype ?? j.job_type,
      'Base Price': d?.base_price ?? 0,
      'Fuel Surcharge': d?.fuel_surcharge_amt ?? 0,
      'Notes': d?.delivery_notes ?? '',
    }
  })
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(deliveryData.length ? deliveryData : [{}]), 'Delivery')

  // Install tab
  const installs = jobs.filter((j) => j.job_type === 'install')
  const installData = installs.map((j) => {
    const d = arr(j.install_details)[0] as Record<string, unknown> | undefined
    return {
      'Job #': j.job_number,
      'Date': j.scheduled_date,
      'Customer': (j.end_customers as { name?: string } | null)?.name ?? '',
      'Install Type': d?.install_type ?? '',
      'Unit Price': d?.unit_price ?? 0,
    }
  })
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(installData.length ? installData : [{}]), 'Install')

  // Storage tab
  const storageData = storage.map((s) => ({
    'Week': s.week_label,
    'Type': s.storage_type,
    'Qty': s.qty,
    'Cost Ex': s.cost_ex,
    'Total Ex': s.total_ex,
  }))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(storageData.length ? storageData : [{}]), 'Storage')

  // Summary tab
  const totalRunup = Number(cycle.total_runup ?? 0)
  const totalDelivery = Number(cycle.total_delivery ?? 0)
  const totalInstall = Number(cycle.total_install ?? 0)
  const totalStorage = Number(cycle.total_storage ?? 0)
  const totalFuel = Number(cycle.total_fuel_surcharge ?? 0)
  const subtotal = totalRunup + totalDelivery + totalInstall + totalStorage
  const fuelSurcharge = totalFuel
  const subtotalWithFuel = subtotal + fuelSurcharge
  const discount = Number(cycle.discount_amount ?? 0)
  const gst = (subtotalWithFuel - discount) * 0.1
  const grandTotal = subtotalWithFuel - discount + gst

  const summaryData = [
    { 'Category': 'Run Ups', 'Amount': totalRunup },
    { 'Category': 'Delivery & Collection', 'Amount': totalDelivery },
    { 'Category': 'Install', 'Amount': totalInstall },
    { 'Category': 'Storage + Misc', 'Amount': totalStorage },
    { 'Category': '', 'Amount': '' },
    { 'Category': 'Subtotal', 'Amount': subtotal },
    { 'Category': 'Fuel Surcharge (11%)', 'Amount': fuelSurcharge },
    { 'Category': 'Discount', 'Amount': -discount },
    { 'Category': 'GST (10%)', 'Amount': gst },
    { 'Category': 'GRAND TOTAL', 'Amount': grandTotal },
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryData), 'Summary')

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  const filename = `${clientName.replace(/\s+/g, '_')}_${cycleName.replace(/\s+/g, '_')}.xlsx`

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}

function generatePDF(
  cycle: Record<string, unknown>,
  jobs: Record<string, unknown>[],
  storage: Record<string, unknown>[],
  clientName: string,
  cycleName: string,
) {
  const totalRunup = Number(cycle.total_runup ?? 0)
  const totalDelivery = Number(cycle.total_delivery ?? 0)
  const totalInstall = Number(cycle.total_install ?? 0)
  const totalStorage = Number(cycle.total_storage ?? 0)
  const totalFuel = Number(cycle.total_fuel_surcharge ?? 0)
  const discount = Number(cycle.discount_amount ?? 0)
  const subtotal = totalRunup + totalDelivery + totalInstall + totalStorage + totalFuel
  const gst = (subtotal - discount) * 0.1
  const grandTotal = subtotal - discount + gst

  const fmt = (n: number) => `$${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`

  // Build line items from jobs
  const runups = jobs.filter(j => j.job_type === 'runup')
  const deliveries = jobs.filter(j => j.job_type === 'delivery' || j.job_type === 'collection')
  const installs = jobs.filter(j => j.job_type === 'install')

  let lineItemsHTML = ''

  function addSection(title: string, items: Record<string, unknown>[], detailKey: string, priceKey: string) {
    if (items.length === 0) return
    lineItemsHTML += `<tr class="section"><td colspan="4" style="font-weight:bold;padding:12px 8px 4px;border-bottom:1px solid #ddd;">${title}</td></tr>`
    for (const j of items) {
      const details = arr((j as Record<string, unknown>)[detailKey])[0] as Record<string, unknown> | undefined
      const price = Number(details?.[priceKey] ?? 0)
      lineItemsHTML += `<tr>
        <td style="padding:4px 8px;">${j.job_number ?? ''}</td>
        <td style="padding:4px 8px;">${j.scheduled_date ?? ''}</td>
        <td style="padding:4px 8px;">${j.serial_number ?? ''}</td>
        <td style="padding:4px 8px;text-align:right;">${fmt(price)}</td>
      </tr>`
    }
  }

  addSection('Run Ups', runups, 'runup_details', 'unit_price')
  addSection('Installs', installs, 'install_details', 'unit_price')

  // Deliveries have base_price
  if (deliveries.length > 0) {
    lineItemsHTML += `<tr class="section"><td colspan="4" style="font-weight:bold;padding:12px 8px 4px;border-bottom:1px solid #ddd;">Delivery &amp; Collection</td></tr>`
    for (const j of deliveries) {
      const d = arr(j.delivery_details)[0] as Record<string, unknown> | undefined
      const price = Number(d?.base_price ?? 0) + Number(d?.fuel_surcharge_amt ?? 0)
      lineItemsHTML += `<tr>
        <td style="padding:4px 8px;">${j.job_number ?? ''}</td>
        <td style="padding:4px 8px;">${j.scheduled_date ?? ''}</td>
        <td style="padding:4px 8px;">${(d?.subtype as string) ?? j.job_type}</td>
        <td style="padding:4px 8px;text-align:right;">${fmt(price)}</td>
      </tr>`
    }
  }

  // Storage
  if (storage.length > 0) {
    lineItemsHTML += `<tr class="section"><td colspan="4" style="font-weight:bold;padding:12px 8px 4px;border-bottom:1px solid #ddd;">Storage + Misc</td></tr>`
    for (const s of storage) {
      lineItemsHTML += `<tr>
        <td style="padding:4px 8px;">${s.week_label ?? ''}</td>
        <td style="padding:4px 8px;">${s.storage_type ?? ''}</td>
        <td style="padding:4px 8px;">Qty: ${s.qty ?? 0}</td>
        <td style="padding:4px 8px;text-align:right;">${fmt(Number(s.total_ex ?? 0))}</td>
      </tr>`
    }
  }

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: Arial, sans-serif; font-size: 12px; color: #333; margin: 40px; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  .header { margin-bottom: 24px; }
  .meta { color: #666; font-size: 11px; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  th { text-align: left; padding: 8px; border-bottom: 2px solid #333; font-size: 11px; text-transform: uppercase; }
  th:last-child { text-align: right; }
  .totals { margin-top: 24px; border-top: 2px solid #333; padding-top: 12px; }
  .totals .row { display: flex; justify-content: space-between; padding: 4px 0; }
  .totals .grand { font-size: 16px; font-weight: bold; border-top: 2px solid #333; padding-top: 8px; margin-top: 8px; }
</style>
</head>
<body>
  <div class="header">
    <h1>Honor Logistics — Invoice</h1>
    <div class="meta">
      <p><strong>Client:</strong> ${clientName}</p>
      <p><strong>Billing Cycle:</strong> ${cycleName}</p>
      <p><strong>Period:</strong> ${cycle.period_start ?? ''} to ${cycle.period_end ?? ''}</p>
      ${cycle.financial_year ? `<p><strong>Financial Year:</strong> ${cycle.financial_year}</p>` : ''}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Reference</th>
        <th>Date</th>
        <th>Description</th>
        <th style="text-align:right">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${lineItemsHTML}
    </tbody>
  </table>

  <div class="totals">
    <div class="row"><span>Subtotal</span><span>${fmt(subtotal - totalFuel)}</span></div>
    <div class="row"><span>Fuel Surcharge (11%)</span><span>${fmt(totalFuel)}</span></div>
    ${discount > 0 ? `<div class="row"><span>Discount</span><span>-${fmt(discount)}</span></div>` : ''}
    <div class="row"><span>GST (10%)</span><span>${fmt(gst)}</span></div>
    <div class="row grand"><span>TOTAL AUD</span><span>${fmt(grandTotal)}</span></div>
  </div>
</body>
</html>`

  const filename = `${clientName.replace(/\s+/g, '_')}_${cycleName.replace(/\s+/g, '_')}_Invoice.html`

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
