import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const VALID_SHEETS = ['runup', 'delivery', 'install', 'inwards', 'toner', 'storage', 'soh'] as const
type SheetType = typeof VALID_SHEETS[number]

interface RouteContext {
  params: Promise<{ sheet: string }>
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return []
  
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[\s'"]/g, '_').replace(/[^a-z0-9_]/g, ''))
  
  return lines.slice(1).map(line => {
    // Handle quoted fields
    const values: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') {
        inQuotes = !inQuotes
      } else if (line[i] === ',' && !inQuotes) {
        values.push(current.trim())
        current = ''
      } else {
        current += line[i]
      }
    }
    values.push(current.trim())
    
    const row: Record<string, string> = {}
    headers.forEach((h, i) => { row[h] = values[i] ?? '' })
    return row
  })
}

function parseDate(val: string): string | null {
  if (!val) return null
  // Try DD/MM/YYYY
  const ddmm = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (ddmm) return `${ddmm[3]}-${ddmm[2].padStart(2, '0')}-${ddmm[1].padStart(2, '0')}`
  // Try YYYY-MM-DD
  const iso = val.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) return val
  // Try MM/DD/YYYY
  const mmdd = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (mmdd) return `${mmdd[3]}-${mmdd[1].padStart(2, '0')}-${mmdd[2].padStart(2, '0')}`
  return null
}

function parseNum(val: string): number | null {
  if (!val || val === '' || val === '-') return null
  const n = parseFloat(val.replace(/[^0-9.-]/g, ''))
  return isNaN(n) ? null : n
}

function isEmpty(val: string): boolean {
  return !val || val.trim() === '' || val.trim() === '-'
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { sheet } = await params

  if (!VALID_SHEETS.includes(sheet as SheetType)) {
    return NextResponse.json({ error: `Unknown sheet type "${sheet}"` }, { status: 400 })
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid request — expected multipart/form-data.' }, { status: 400 })
  }

  const file = formData.get('file')
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'No file uploaded.' }, { status: 400 })
  }

  const blob = file as File
  if (blob.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: 'File too large. Maximum 10MB.' }, { status: 413 })
  }

  const text = await blob.text()
  const rows = parseCSV(text)
  
  if (rows.length === 0) {
    return NextResponse.json({ error: 'No data rows found in CSV.' }, { status: 400 })
  }

  const supabase = await createClient()

  let imported = 0
  let skipped = 0
  const errors: { row: number; reason: string }[] = []

  if (sheet === 'runup') {
    // week, date, fy, customer, model, serial, action_type, qty, price_ex, comments
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const customer = row['customer'] || row['end_customer'] || ''
      const priceEx = parseNum(row['price_ex'] || row['price'] || '')

      if (isEmpty(customer)) { skipped++; continue }
      if (!priceEx || priceEx === 0) { skipped++; continue }

      try {
        // Look up or create end_customer
        let endCustomerId: string | null = null
        if (customer) {
          const { data: ec } = await supabase
            .from('end_customers')
            .select('id')
            .ilike('name', customer)
            .limit(1)
            .single()
          endCustomerId = ec?.id ?? null
        }

        const jobNum = `IMP-RU-${Date.now()}-${i}`
        const { data: job, error: jobErr } = await supabase
          .from('jobs')
          .insert({
            job_number: jobNum,
            job_type: 'runup',
            status: 'complete',
            end_customer_id: endCustomerId,
            serial_number: row['serial'] || row['serial_number'] || null,
            scheduled_date: parseDate(row['date'] || ''),
            notes: row['comments'] || row['notes'] || null,
          })
          .select()
          .single()

        if (jobErr) { errors.push({ row: i + 2, reason: jobErr.message }); continue }

        await supabase.from('runup_details').insert({
          job_id: job.id,
          action_type: row['action_type'] || null,
          unit_price: priceEx,
          check_power_on: false,
          check_firmware_loaded: false,
          check_customer_config: false,
          check_serial_verified: false,
          check_test_print: false,
          check_signed_off: false,
        })

        imported++
      } catch (e) {
        errors.push({ row: i + 2, reason: String(e) })
      }
    }
  }

  else if (sheet === 'delivery') {
    // week, date, fy, customer, model, serial, action, qty, price_ex, total_inc_fuel, comments
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const customer = row['customer'] || ''
      const priceEx = parseNum(row['price_ex'] || row['price'] || '')

      if (isEmpty(customer)) { skipped++; continue }
      if (!priceEx || priceEx === 0) { skipped++; continue }

      try {
        const subtype = (row['action'] || row['subtype'] || 'delivery').toLowerCase()
        const validSubtypes = ['delivery', 'collection', 'recycling', 'swap']
        const normalizedSubtype = validSubtypes.includes(subtype) ? subtype : 'delivery'

        let endCustomerId: string | null = null
        if (customer) {
          const { data: ec } = await supabase.from('end_customers').select('id').ilike('name', customer).limit(1).single()
          endCustomerId = ec?.id ?? null
        }

        const jobNum = `IMP-DL-${Date.now()}-${i}`
        const { data: job, error: jobErr } = await supabase
          .from('jobs')
          .insert({
            job_number: jobNum,
            job_type: normalizedSubtype === 'collection' ? 'collection' : 'delivery',
            status: 'complete',
            end_customer_id: endCustomerId,
            serial_number: row['serial'] || null,
            scheduled_date: parseDate(row['date'] || ''),
            notes: row['comments'] || null,
          })
          .select()
          .single()

        if (jobErr) { errors.push({ row: i + 2, reason: jobErr.message }); continue }

        const totalIncFuel = parseNum(row['total_inc_fuel'] || '')
        const fuelAmt = totalIncFuel && priceEx ? totalIncFuel - priceEx : null

        await supabase.from('delivery_details').insert({
          job_id: job.id,
          subtype: normalizedSubtype as 'delivery' | 'collection' | 'recycling' | 'swap',
          base_price: priceEx,
          fuel_surcharge_pct: 11,
          fuel_surcharge_amt: fuelAmt && fuelAmt > 0 ? fuelAmt : null,
          fuel_override: false,
          total_price: totalIncFuel || priceEx,
        })

        imported++
      } catch (e) {
        errors.push({ row: i + 2, reason: String(e) })
      }
    }
  }

  else if (sheet === 'install') {
    // week, date, fy, customer, model, serial, action, price_ex, fma_notes
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const customer = row['customer'] || ''
      const priceEx = parseNum(row['price_ex'] || row['price'] || '')

      if (isEmpty(customer)) { skipped++; continue }

      try {
        let endCustomerId: string | null = null
        if (customer) {
          const { data: ec } = await supabase.from('end_customers').select('id').ilike('name', customer).limit(1).single()
          endCustomerId = ec?.id ?? null
        }

        const jobNum = `IMP-IN-${Date.now()}-${i}`
        const { data: job, error: jobErr } = await supabase
          .from('jobs')
          .insert({
            job_number: jobNum,
            job_type: 'install',
            status: 'complete',
            end_customer_id: endCustomerId,
            serial_number: row['serial'] || null,
            scheduled_date: parseDate(row['date'] || ''),
          })
          .select()
          .single()

        if (jobErr) { errors.push({ row: i + 2, reason: jobErr.message }); continue }

        await supabase.from('install_details').insert({
          job_id: job.id,
          install_type: row['action'] || null,
          unit_price: priceEx,
          fma_notes: row['fma_notes'] || null,
        })

        imported++
      } catch (e) {
        errors.push({ row: i + 2, reason: String(e) })
      }
    }
  }

  else if (sheet === 'inwards') {
    // week, date, fy, action, qty, po_number, sender_name, product_code, serial_no, cost_ex, notes
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const movType = (row['action'] || row['movement_type'] || '').toLowerCase()
      const validTypes = ['inwards', 'outwards']
      if (!validTypes.includes(movType)) { skipped++; continue }

      try {
        await supabase.from('warehouse_movements').insert({
          movement_type: movType as 'inwards' | 'outwards',
          movement_date: parseDate(row['date'] || ''),
          po_number: row['po_number'] || null,
          sender_name: row['sender_name'] || null,
          product_code: row['product_code'] || null,
          serial_number: row['serial_no'] || row['serial_number'] || null,
          quantity: parseNum(row['qty'] || '1') || 1,
          unit_price: parseNum(row['cost_ex'] || ''),
          notes: row['notes'] || null,
        })
        imported++
      } catch (e) {
        errors.push({ row: i + 2, reason: String(e) })
      }
    }
  }

  else if (sheet === 'toner') {
    // week, date, fy, courier, efex_ni, qty, price_ex, tracking_number
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]

      try {
        const jobNum = `IMP-TN-${Date.now()}-${i}`
        const { data: job } = await supabase
          .from('jobs')
          .insert({ job_number: jobNum, job_type: 'toner_ship', status: 'dispatched', scheduled_date: parseDate(row['date'] || '') })
          .select()
          .single()

        if (job) {
          await supabase.from('toner_orders').insert({
            job_id: job.id,
            courier: row['courier'] || null,
            efex_ni: row['efex_ni'] || null,
            tracking_number: row['tracking_number'] || null,
            dispatch_date: parseDate(row['date'] || ''),
            total_price: parseNum(row['price_ex'] || row['total_price'] || ''),
            status: 'delivered',
          })
        }
        imported++
      } catch (e) {
        errors.push({ row: i + 2, reason: String(e) })
      }
    }
  }

  else if (sheet === 'storage') {
    // week, fy, storage_type, qty, cost_ex, total_ex
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const storageType = row['storage_type'] || ''
      if (isEmpty(storageType)) { skipped++; continue }

      try {
        await supabase.from('storage_weekly').insert({
          week_label: row['week'] || null,
          storage_type: storageType,
          qty: parseNum(row['qty'] || '1') || 1,
          cost_ex: parseNum(row['cost_ex'] || ''),
          total_ex: parseNum(row['total_ex'] || ''),
          auto_populated: true,
        })
        imported++
      } catch (e) {
        errors.push({ row: i + 2, reason: String(e) })
      }
    }
  }

  else if (sheet === 'soh') {
    // date_inwards, po_number, product_group, uom, product_code, brand, location, sender_name, description, serial_no, customer, notes
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const description = row['description'] || row['desc'] || ''
      if (isEmpty(description)) { skipped++; continue }

      try {
        // Find client by customer name
        let clientId: string | null = null
        const customer = row['customer'] || ''
        if (customer) {
          const { data: client } = await supabase.from('clients').select('id').ilike('name', customer).limit(1).single()
          clientId = client?.id ?? null
        }

        await supabase.from('inventory').insert({
          description: description || null,
          brand: row['brand'] || null,
          product_code: row['product_code'] || null,
          serial_number: row['serial_no'] || row['serial_number'] || null,
          location: row['location'] || null,
          uom: row['uom'] || null,
          item_class: (row['product_group'] || '').toLowerCase().includes('pallet') ? 'pallet' :
                      (row['product_group'] || '').toLowerCase().includes('machine') ? 'machine' : 'accessory',
          condition: 'refurb',
          client_id: clientId,
          inwards_date: parseDate(row['date_inwards'] || row['date'] || ''),
          notes: [row['notes'], row['po_number'] ? `PO: ${row['po_number']}` : '', row['sender_name'] ? `From: ${row['sender_name']}` : ''].filter(Boolean).join(' | ') || null,
          is_active: true,
          quantity: 1,
        })
        imported++
      } catch (e) {
        errors.push({ row: i + 2, reason: String(e) })
      }
    }
  }

  return NextResponse.json({
    message: `Import complete.`,
    imported,
    skipped,
    errors: errors.length,
    errorDetails: errors.slice(0, 20),
    sheet,
    total: rows.length,
  })
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { sheet } = await params
  if (!VALID_SHEETS.includes(sheet as SheetType)) {
    return NextResponse.json({ error: `Unknown sheet type "${sheet}"` }, { status: 400 })
  }
  return NextResponse.json({ sheet, note: `POST CSV file to /api/import/${sheet}` })
}
