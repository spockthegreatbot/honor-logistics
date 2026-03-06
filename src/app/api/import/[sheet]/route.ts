import { NextRequest, NextResponse } from 'next/server'

// Valid import sheet types — mirrors the 7 original Excel sheets
const VALID_SHEETS = [
  'runup',
  'delivery',
  'install',
  'inwards',
  'toner',
  'storage',
  'billing',
] as const

type SheetType = typeof VALID_SHEETS[number]

interface RouteContext {
  params: Promise<{ sheet: string }>
}

/**
 * POST /api/import/[sheet]
 *
 * Phase 1: Stub — validates sheet type, accepts CSV, returns 202 (queued).
 * Phase 2: Wire up actual row parsing, validation, and DB inserts.
 *
 * Body: multipart/form-data with field "file" (CSV)
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const { sheet } = await params

  // Validate sheet type
  if (!VALID_SHEETS.includes(sheet as SheetType)) {
    return NextResponse.json(
      { error: `Unknown sheet type "${sheet}". Valid types: ${VALID_SHEETS.join(', ')}` },
      { status: 400 }
    )
  }

  // Parse multipart form
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid request — expected multipart/form-data.' }, { status: 400 })
  }

  const file = formData.get('file')
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'No file uploaded. Send CSV as "file" field.' }, { status: 400 })
  }

  // Basic validation
  const blob = file as File
  if (!blob.name.endsWith('.csv')) {
    return NextResponse.json({ error: 'File must be a .csv file.' }, { status: 400 })
  }

  if (blob.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: 'File too large. Maximum 10MB.' }, { status: 413 })
  }

  // Read content (for Phase 2 — row counting / parsing)
  const text = await blob.text()
  const lines = text.split('\n').filter((l) => l.trim().length > 0)
  const rowCount = Math.max(0, lines.length - 1) // subtract header row

  // TODO Phase 2: Parse rows, validate against schema, insert into Supabase
  // const supabase = await createClient()
  // const rows = parseCSV(text, sheet as SheetType)
  // const { error } = await supabase.from(sheetToTable[sheet]).insert(rows)

  console.log(`[Import] Sheet: ${sheet}, File: ${blob.name}, Rows: ${rowCount}`)

  return NextResponse.json(
    {
      message: `${rowCount} rows received — import queued. Full processing wired in Phase 2.`,
      sheet,
      rows: rowCount,
      filename: blob.name,
    },
    { status: 202 }
  )
}

/**
 * GET /api/import/[sheet]
 * Returns the expected CSV schema for a given sheet type.
 */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { sheet } = await params

  const schemas: Record<SheetType, { columns: string[]; notes: string }> = {
    runup: {
      columns: ['Date', 'Machine Type', 'Serial Number', 'Client', 'End Customer', 'Action', 'Price', 'Notes'],
      notes: 'Date format: DD/MM/YYYY. Machine Type: A4_SFP | A4_MFD | A3 | FINISHER | FIN_ACCESSORIES',
    },
    delivery: {
      columns: ['Date', 'Subtype', 'From Address', 'To Address', 'Client', 'Driver', 'Base Price', 'Fuel Override', 'Override Reason', 'Notes'],
      notes: 'Subtype: delivery | collection | recycling | swap. Fuel Override: TRUE or FALSE.',
    },
    install: {
      columns: ['Date', 'Machine Type', 'Serial Number', 'Client', 'End Customer', 'PaperCut Required', 'FMA Required', 'Price', 'Notes'],
      notes: 'PaperCut Required / FMA Required: TRUE or FALSE.',
    },
    inwards: {
      columns: ['Date', 'Movement Type', 'PO Number', 'Sender', 'Receiver', 'Product Code', 'Serial Number', 'Qty', 'Pallet Location', 'Condition'],
      notes: 'Movement Type: inwards | outwards. Condition: new | refurb | faulty | for_disposal.',
    },
    toner: {
      columns: ['Date', 'NI Number', 'Courier', 'Tracking Number', 'Weight KG', 'Dispatch Date', 'Est Delivery', 'Status', 'Total Price'],
      notes: 'Courier: GO_Logistics | TNT | Couriers_Please | StarTrack | Other. Status: pending | packed | dispatched | delivered.',
    },
    storage: {
      columns: ['Week Label', 'Storage Type', 'Qty', 'Cost Ex', 'Total Ex', 'Billing Cycle Name', 'Client', 'Notes'],
      notes: 'Billing Cycle Name must match an existing cycle. Client must match an existing client name.',
    },
    billing: {
      columns: ['Cycle Name', 'Client', 'Period Start', 'Period End', 'Financial Year', 'Status', 'Grand Total', 'Xero Invoice Number'],
      notes: 'Status: open | review | invoiced | paid. Financial Year format: 2025-2026.',
    },
  }

  if (!VALID_SHEETS.includes(sheet as SheetType)) {
    return NextResponse.json({ error: `Unknown sheet type "${sheet}"` }, { status: 400 })
  }

  return NextResponse.json({
    sheet,
    schema: schemas[sheet as SheetType],
    endpoint: `POST /api/import/${sheet}`,
    contentType: 'multipart/form-data',
    maxSizeMB: 10,
  })
}
