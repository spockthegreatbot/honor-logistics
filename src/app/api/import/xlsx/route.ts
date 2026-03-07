import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/require-auth'
import * as XLSX from 'xlsx'

function sf(v: unknown): number {
  if (typeof v === 'number') return v
  if (typeof v === 'string') { const n = parseFloat(v.replace(/,/g, '')); return isNaN(n) ? 0 : n }
  return 0
}
function ss(v: unknown): string { return v ? String(v).trim() : '' }
function dtStr(v: unknown): string | null {
  if (!v) return null
  if (typeof v === 'number') {
    // Excel serial date
    const date = XLSX.SSF.parse_date_code(v)
    if (!date) return null
    const y = date.y, m = String(date.m).padStart(2,'0'), d = String(date.d).padStart(2,'0')
    return `${y}-${m}-${d}`
  }
  if (typeof v === 'string' && v.match(/^\d{4}-\d{2}-\d{2}/)) return v.slice(0,10)
  return null
}

function mapCourier(s: string): string {
  const u = s.toUpperCase()
  if (u.includes('GO')) return 'GO_Logistics'
  if (u.includes('TNT')) return 'TNT'
  if (u.includes('COURIERS')) return 'Couriers_Please'
  if (u.includes('STAR')) return 'StarTrack'
  return 'Other'
}

export async function POST(request: NextRequest) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createClient()

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  const cycleId = formData.get('cycle_id') as string | null
  const formClientId = (formData.get('client_id') as string | null) || null

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false })

  // Get client list; use provided client_id, or fall back to EFEX
  const { data: clients } = await supabase.from('clients').select('id, name')
  const efexClient = clients?.find(c => c.name.toLowerCase().includes('efex'))

  // Resolve the billing client for this import
  const resolvedImportClientId = formClientId
    ?? efexClient?.id
    ?? null

  let resolvedCycleId = cycleId
  let resolvedCycleName = ''

  if (!resolvedCycleId) {
    // Auto-detect cycle info from Excel
    // Week labels from Storage tab
    const storageWs = workbook.Sheets['Storage']
    const storageData = storageWs ? (XLSX.utils.sheet_to_json<unknown[]>(storageWs, { header: 1, defval: null }) as unknown[][]) : []
    const weekLabels = [...new Set(
      storageData.slice(5)
        .map(r => r[2] ? String(r[2]).trim() : null)
        .filter(Boolean) as string[]
    )].sort()

    // Date range from Delivery sheet
    const deliveryWs = workbook.Sheets['Delivery & Collection']
    const deliveryData = deliveryWs ? (XLSX.utils.sheet_to_json<unknown[]>(deliveryWs, { header: 1, defval: null }) as unknown[][]) : []
    const dates: string[] = deliveryData.slice(2)
      .map(r => dtStr(r[1]))
      .filter(Boolean) as string[]
    const periodStart = dates.length ? dates.reduce((a, b) => a < b ? a : b) : new Date().toISOString().slice(0, 10)
    const periodEnd = dates.length ? dates.reduce((a, b) => a > b ? a : b) : new Date().toISOString().slice(0, 10)

    // FY from Storage
    const fyRow = storageData.slice(5).find(r => r[3])
    const fyNum = fyRow ? Number(fyRow[3]) : new Date().getFullYear() % 100
    const fyLabel = `FY${fyNum - 1}-${fyNum}`

    // Build cycle name e.g. "Week 33-34 FY25-26"
    const weekRange = weekLabels.length === 1
      ? weekLabels[0]
      : `${weekLabels[0]?.replace('Week ', 'Week ')}-${weekLabels[weekLabels.length - 1]?.replace('Week ', '')}`
    resolvedCycleName = `${weekRange} ${fyLabel}`

    // Create new billing cycle
    const { data: newCycle, error: createErr } = await supabase
      .from('billing_cycles')
      .insert({
        cycle_name: resolvedCycleName,
        client_id: resolvedImportClientId,
        period_start: periodStart,
        period_end: periodEnd,
        financial_year: fyLabel,
        status: 'open',
        total_runup: 0, total_delivery: 0, total_fuel_surcharge: 0,
        total_install: 0, total_storage: 0, total_toner: 0,
        discount_amount: 0, subtotal: 0, gst_amount: 0, grand_total: 0,
      })
      .select('id, cycle_name')
      .single()

    if (createErr || !newCycle) {
      return NextResponse.json({ error: `Failed to auto-create billing cycle: ${createErr?.message}` }, { status: 500 })
    }
    resolvedCycleId = newCycle.id
    resolvedCycleName = newCycle.cycle_name ?? resolvedCycleName
  } else {
    // Verify existing cycle
    const { data: cycle, error: cycleErr } = await supabase
      .from('billing_cycles')
      .select('id, cycle_name, client_id')
      .eq('id', resolvedCycleId)
      .single()
    if (cycleErr || !cycle) return NextResponse.json({ error: 'Billing cycle not found' }, { status: 404 })
    resolvedCycleName = cycle.cycle_name ?? ''
  }

  const activeCycleId = resolvedCycleId

  const clientId = resolvedImportClientId

  const counts: Record<string, number> = { runup: 0, install: 0, delivery: 0, collection: 0, toner: 0, storage: 0, storage_total: 0, errors: 0 }

  // Helper: get sheet rows as arrays
  function getRows(sheetName: string): unknown[][] {
    const ws = workbook.Sheets[sheetName]
    if (!ws) return []
    return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null })
  }

  // Build job template
  let jobCounter = Date.now() % 100000 // unique per import
  function makeJob(type: string, date: string | null, serial: string, notes: string) {
    return {
      job_number: `HRL-IMP-${jobCounter++}`,
      job_type: type,
      status: 'complete',
      billing_cycle_id: activeCycleId,
      client_id: clientId,
      scheduled_date: date,
      serial_number: serial || null,
      notes: notes || null,
      machine_id: null,
      end_customer_id: null,
      assigned_to: null,
      po_number: null,
      email_source_id: null,
      completed_at: null,
    }
  }

  const jobsBulk: ReturnType<typeof makeJob>[] = []
  const jobDetails: Record<number, [string, Record<string, unknown>]> = {}

  // RUN UPS
  const runupRows = getRows('Run Up')
  for (const row of runupRows.slice(2) as unknown[][]) {
    if (!row[3] || !row[6] || sf(row[9]) === 0) continue
    const d = dtStr(row[1])
    if (!d) continue
    const idx = jobsBulk.length
    jobsBulk.push(makeJob('runup', d, ss(row[5]), `${ss(row[3])} | ${ss(row[4])} | ${ss(row[6])}`))
    jobDetails[idx] = ['runup', { action_type: ss(row[6]), machine_type: ss(row[4]), unit_price: sf(row[8]), check_signed_off: true }]
  }

  // INSTALL
  const installRows = getRows('Install')
  for (const row of installRows.slice(2) as unknown[][]) {
    if (!row[3] || !row[6] || sf(row[7]) === 0) continue
    const d = dtStr(row[1])
    if (!d) continue
    const action = ss(row[6])
    const idx = jobsBulk.length
    jobsBulk.push(makeJob('install', d, ss(row[5]), `${ss(row[3])} | ${ss(row[4])} | ${action}`))
    jobDetails[idx] = ['install', { install_type: action, unit_price: sf(row[7]), fma_required: action.toLowerCase().includes('fma') || action.toLowerCase().includes('papercut'), papercut_required: action.toLowerCase().includes('papercut') }]
  }

  // DELIVERY & COLLECTION
  const deliveryRows = getRows('Delivery & Collection')
  for (const row of deliveryRows.slice(2) as unknown[][]) {
    if (!row[3] || !row[6] || sf(row[9]) === 0) continue
    const d = dtStr(row[1])
    if (!d) continue
    const action = ss(row[6]); const al = action.toLowerCase()
    const jtype = (al.includes('collection only') || al.includes('collection/delivery') || al.includes('recycl') || al.includes('dispose')) ? 'collection' : 'delivery'
    const sub = (al.includes('recycl') || al.includes('dispose')) ? 'recycling' : al.includes('collection') ? 'collection' : 'delivery'
    const base = sf(row[9]); const fuel = sf(row[10])
    const idx = jobsBulk.length
    jobsBulk.push(makeJob(jtype, d, ss(row[5]), `${ss(row[3])} | ${action}`))
    jobDetails[idx] = ['delivery', { subtype: sub, base_price: base, fuel_override: fuel === 0 && base > 0, fuel_surcharge_amt: fuel, total_price: base + fuel, delivery_notes: action }]
  }

  // TONER
  const tonerRows = getRows('Toner')
  for (const row of tonerRows.slice(5) as unknown[][]) {
    if (!row[0] || !row[4] || sf(row[6]) === 0) continue
    const d = dtStr(row[1])
    if (!d) continue
    const idx = jobsBulk.length
    jobsBulk.push(makeJob('toner_ship', d, '', `NI:${ss(row[4])} | ${ss(row[3])}`))
    jobDetails[idx] = ['toner', { courier: mapCourier(ss(row[3])), efex_ni: ss(row[4]), tracking_number: row[8] ? String(row[8]).slice(0, 50) : null, status: 'delivered', total_price: sf(row[6]) }]
  }

  if (jobsBulk.length === 0) {
    return NextResponse.json({ error: 'No valid rows found in Excel file' }, { status: 400 })
  }

  // Insert jobs in batches of 50
  const allCreated: { id: string }[] = []
  for (let i = 0; i < jobsBulk.length; i += 50) {
    const { data, error } = await supabase.from('jobs').insert(jobsBulk.slice(i, i + 50)).select('id')
    if (error) { counts.errors++; continue }
    allCreated.push(...(data ?? []))
  }

  // Build detail arrays
  const rb: Record<string, unknown>[] = [], ib: Record<string, unknown>[] = [], db: Record<string, unknown>[] = [], tb: Record<string, unknown>[] = []
  for (let i = 0; i < allCreated.length; i++) {
    if (!(i in jobDetails)) continue
    const [dtype, ddata] = jobDetails[i]
    const detail = { ...ddata, job_id: allCreated[i].id }
    if (dtype === 'runup') { rb.push(detail); counts.runup++ }
    else if (dtype === 'install') { ib.push(detail); counts.install++ }
    else if (dtype === 'delivery') {
      db.push(detail)
      const jtype = jobsBulk[i].job_type
      if (jtype === 'collection') counts.collection++; else counts.delivery++
    }
    else if (dtype === 'toner') { tb.push(detail); counts.toner++ }
  }

  // Insert details in batches
  const detailInserts: Array<[string, Record<string, unknown>[]]> = [['runup_details', rb], ['install_details', ib], ['delivery_details', db], ['toner_orders', tb]]
  for (const [tbl, data] of detailInserts) {
    for (let i = 0; i < data.length; i += 100) {
      await supabase.from(tbl).insert(data.slice(i, i + 100))
    }
  }

  // STORAGE — storage_weekly table
  const storageRows = getRows('Storage')
  const storageBulk: Record<string, unknown>[] = []
  let storageTotal = 0
  for (const row of storageRows.slice(5) as unknown[][]) {
    if (!row[2] || !row[4]) continue
    const qty = sf(row[5]); const cost = sf(row[6]); const total = sf(row[7])
    if (total === 0) continue
    storageBulk.push({
      billing_cycle_id: activeCycleId,
      week_label: ss(row[2]),
      storage_type: ss(row[4]),
      qty: Math.round(qty),
      cost_ex: cost,
      total_ex: total,
      auto_populated: false,
    })
    storageTotal += total
  }
  if (storageBulk.length > 0) {
    await supabase.from('storage_weekly').delete().eq('billing_cycle_id', activeCycleId)
    await supabase.from('storage_weekly').insert(storageBulk)
  }
  counts.storage = storageBulk.length
  counts.storage_total = storageTotal

  // Auto-trigger recalculate
  const recalcUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://honor-logistics.vercel.app'}/api/billing/${activeCycleId}/calculate`
  fetch(recalcUrl, { method: 'POST', headers: { 'Cookie': request.headers.get('cookie') || '' } }).catch(() => {})

  return NextResponse.json({
    success: true,
    cycle_name: resolvedCycleName,
    cycle_id: resolvedCycleId,
    auto_created_cycle: !formData.get('cycle_id'),
    imported: counts,
    total_jobs: allCreated.length,
  })
}
