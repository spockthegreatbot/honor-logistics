export interface AxusJobData {
  axusJobNumber: string
  jobType: string        // "consumable" | "delivery" | "installation"
  status: string
  dateDue: string | null  // YYYY-MM-DD
  dateOut: string | null  // YYYY-MM-DD
  priority: string

  // Customer (billing entity)
  customerName: string
  customerCode: string
  customerAddress: string
  customerPhone: string
  customerAttn: string

  // Ship To (delivery destination)
  shipToName: string
  shipToCode: string
  shipToAddress: string
  shipToPhone: string
  shipToAttn: string

  // Equipment
  machineItemCode: string
  machineModel: string
  serialNumber: string
  fault: string

  lineItems: Array<{
    code: string
    description: string
    qty: number
  }>
}

function parseDate(raw: string | null | undefined): string | null {
  if (!raw) return null
  // Handles DD/MM/YY or DD/MM/YYYY
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (!m) return null
  const day = m[1].padStart(2, '0')
  const month = m[2].padStart(2, '0')
  let year = m[3]
  if (year.length === 2) {
    year = (parseInt(year, 10) >= 50 ? '19' : '20') + year
  }
  return `${year}-${month}-${day}`
}

function extract(text: string, label: string): string | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // Match label followed by optional colon/whitespace, then capture value
  const m = text.match(new RegExp(`${escaped}[:\\s]+([^\\n]+)`, 'i'))
  return m ? m[1].trim() : null
}

export async function parseAxusJobPdf(buffer: Buffer): Promise<AxusJobData> {
  // Lazy-load pdf-parse to avoid module-level crashes in serverless environments
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require('pdf-parse') as (buffer: Buffer) => Promise<{ text: string; numpages: number }>
  const parsed = await pdfParse(buffer)
  const text = parsed.text

  // ── Job header fields ────────────────────────────────────────────────────
  const jobNumber = extract(text, 'Job#') ?? extract(text, 'Job No') ?? extract(text, 'Job Number') ?? ''
  const rawType = extract(text, 'Type') ?? ''
  const jobType = mapJobType(rawType)
  const status = extract(text, 'Status') ?? 'Booked'
  const dateDue = parseDate(extract(text, 'Date Due'))
  const dateOut = parseDate(extract(text, 'Date Out'))
  const priority = extract(text, 'Priority') ?? 'Normal'

  // ── Customer block ───────────────────────────────────────────────────────
  // Customer line: "FDC Construction & Fitout Pty Ltd (Code: FDCCONS001)"
  const customerLine = extract(text, 'Customer') ?? ''
  const customerName = customerLine.replace(/\(Code:[^)]+\)/i, '').trim()
  const customerCodeM = customerLine.match(/Code:\s*([^\s)]+)/i)
  const customerCode = customerCodeM?.[1] ?? ''

  // Address / Tel / Attn for customer block
  // Strategy: find the "Customer:" block and parse next few lines
  const customerBlock = extractBlock(text, 'Customer', 'Ship To')
  const customerAddress = extractBlockField(customerBlock, 'Address') ?? ''
  const customerPhone = extractBlockField(customerBlock, 'Tel') ?? extractBlockField(customerBlock, 'Phone') ?? ''
  const customerAttn = extractBlockField(customerBlock, 'Attn') ?? ''

  // ── Ship To block ────────────────────────────────────────────────────────
  const shipToLine = extract(text, 'Ship To') ?? ''
  const shipToName = shipToLine.replace(/\(Code:[^)]+\)/i, '').trim()
  const shipToCodeM = shipToLine.match(/Code:\s*([^\s)]+)/i)
  const shipToCode = shipToCodeM?.[1] ?? ''

  const shipToBlock = extractBlock(text, 'Ship To', 'Machine')
  const shipToAddress = extractBlockField(shipToBlock, 'Address') ?? ''
  const shipToPhone = extractBlockField(shipToBlock, 'Tel') ?? extractBlockField(shipToBlock, 'Phone') ?? ''
  const shipToAttn = extractBlockField(shipToBlock, 'Attn') ?? ''

  // ── Machine ───────────────────────────────────────────────────────────────
  const machineLine = extract(text, 'Machine') ?? ''
  // "DocuCentre-VII C2273-4TM Fax | Item: DC7C2273-4F | Serial#: 360346"
  const machineParts = machineLine.split(/\s*\|\s*/)
  const machineModel = machineParts[0]?.trim() ?? ''
  const itemPart = machineParts.find(p => /Item:/i.test(p))
  const machineItemCode = itemPart?.replace(/Item:/i, '').trim() ?? extract(text, 'Item') ?? ''
  const serialPart = machineParts.find(p => /Serial#?:/i.test(p))
  const serialNumber = serialPart?.replace(/Serial#?:/i, '').trim() ?? extract(text, 'Serial#') ?? extract(text, 'Serial No') ?? ''
  const fault = extract(text, 'Fault') ?? ''

  // ── Line items ────────────────────────────────────────────────────────────
  // Pattern: "CT202635 | Toner Cartridge C | Qty: 1"
  const lineItems: AxusJobData['lineItems'] = []
  const lineItemRe = /([A-Z0-9-]{4,})\s*\|\s*([^|]+?)\s*\|\s*Qty[:\s]+(\d+)/gi
  let m: RegExpExecArray | null
  while ((m = lineItemRe.exec(text)) !== null) {
    lineItems.push({
      code: m[1].trim(),
      description: m[2].trim(),
      qty: parseInt(m[3], 10),
    })
  }

  return {
    axusJobNumber: jobNumber.split(/\s/)[0], // take first token in case of trailing text
    jobType,
    status,
    dateDue,
    dateOut,
    priority,
    customerName,
    customerCode,
    customerAddress,
    customerPhone,
    customerAttn,
    shipToName,
    shipToCode,
    shipToAddress,
    shipToPhone,
    shipToAttn,
    machineItemCode,
    machineModel,
    serialNumber,
    fault,
    lineItems,
  }
}

function mapJobType(raw: string): string {
  const lower = raw.toLowerCase()
  if (lower.includes('consumable')) return 'consumable'
  if (lower.includes('install')) return 'installation'
  if (lower.includes('deliver') || lower.includes('supply')) return 'delivery'
  return lower.trim() || 'delivery'
}

/** Extract the text between two section headers */
function extractBlock(text: string, startLabel: string, endLabel: string): string {
  const startIdx = text.search(new RegExp(startLabel + '[:\\s]', 'i'))
  if (startIdx === -1) return ''
  const endIdx = endLabel ? text.search(new RegExp(endLabel + '[:\\s]', 'i')) : text.length
  return endIdx > startIdx ? text.slice(startIdx, endIdx) : text.slice(startIdx)
}

/** Extract a named field from a block of text */
function extractBlockField(block: string, label: string): string | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = block.match(new RegExp(`${escaped}[:\\s]+([^\\n|]+)`, 'i'))
  return m ? m[1].trim() : null
}
