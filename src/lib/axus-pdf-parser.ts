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
  const { PDFParse } = require('pdf-parse') as { PDFParse: new (opts: { data: Buffer }) => { getText: () => Promise<{ text: string }> } }
  const parser = new PDFParse({ data: buffer })
  const result = await parser.getText()
  const text = result.text

  // Axus PDFs are two-column — pdf-parse interleaves both columns into one text stream.
  // Column data appears duplicated (company name, phone, address appear twice).

  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0)

  // ── Job number: first standalone 5-6 digit number in the text ─────────────
  const jobNumber = text.match(/\b(\d{5,6})\b/)?.[1] ?? ''

  // ── Job type ──────────────────────────────────────────────────────────────
  const rawType = text.match(/^(Consumable|Installation|Delivery|Service|Collection)$/mi)?.[1] ?? ''
  const jobType = mapJobType(rawType)

  // ── Status ────────────────────────────────────────────────────────────────
  const status = text.match(/^(Booked|In Progress|Complete|Cancelled)$/mi)?.[1] ?? 'Booked'

  // ── Priority ─────────────────────────────────────────────────────────────
  const priority = text.match(/\b(Normal|High|Urgent|Low)\b/i)?.[1] ?? 'Normal'

  // ── Dates ─────────────────────────────────────────────────────────────────
  const dateDue = parseDate(text.match(/Date Due:[\s\S]*?(\d{1,2}\/\d{1,2}\/\d{2,4})/)?.[1] ?? null)
  const dateOut = parseDate(text.match(/Date Out:\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i)?.[1] ?? null)

  // ── Phone: appears duplicated "0296425444\t0296425444" — take first part ──
  const phoneRaw = text.match(/0[2-9][\d ]{7,10}/)?.[0]?.split(/[\s\t]+/)?.[0]?.trim() ?? ''
  const customerPhone = phoneRaw
  const shipToPhone = phoneRaw

  // ── Company name: line immediately after the phone number line ────────────
  const phoneLineIdx = lines.findIndex(l => /^0[2-9][\d\s]{7,}/.test(l))
  const companyName = phoneLineIdx >= 0 ? lines[phoneLineIdx + 1] ?? '' : ''
  const customerName = companyName
  const shipToName = companyName

  // ── Customer/Ship code ────────────────────────────────────────────────────
  const customerCode = text.match(/Code:[\s\t]*Code:[\s\S]*?\n([A-Z0-9]{4,20})/)?.[1] ?? ''
  const shipToCode = customerCode

  // ── Address: street line + "SUBURB, STATE POSTCODE" line ─────────────────
  const addrM = text.match(/([^\n]{5,80})\n([A-Z][A-Z\s,]+(?:NSW|VIC|QLD|SA|WA|TAS|ACT|NT)\s*\d{4})/)
  const customerAddress = addrM ? `${addrM[1].trim()}, ${addrM[2].trim()}` : ''
  const shipToAddress = customerAddress

  // ── Attn: appears after "Job#" label (two-column layout puts name there), duplicated ──
  const attnRaw = text.match(/Job#\s*[\r\n]+([^\r\n]{2,80})/)?.[1]?.trim() ?? ''
  const attnWords = attnRaw.split(/\s+/)
  const half = Math.floor(attnWords.length / 2)
  const attn = (half > 0 && attnWords.slice(0, half).join(' ') === attnWords.slice(half).join(' '))
    ? attnWords.slice(0, half).join(' ') : attnRaw
  const customerAttn = attn
  const shipToAttn = attn

  // ── Machine: "{serial}\tSerial #:\t{model}\t{itemCode}\tItem:" ────────────
  const machineLineM = text.match(/(\d{5,9})\s+Serial #:\s+([^\t]+?)\s+([A-Z0-9][A-Z0-9-]{3,})\s+Item:/)
  const serialNumber = machineLineM?.[1] ?? ''
  const machineModel = machineLineM?.[2]?.trim() ?? ''
  const machineItemCode = machineLineM?.[3] ?? ''

  // ── Fault ─────────────────────────────────────────────────────────────────
  const fault = extract(text, 'Fault') ?? ''

  // ── Line items: "$price $total\tCODE UNIT\tDescription qty" ───────────────
  const lineItems: AxusJobData['lineItems'] = []
  const lineItemRe = /\$[\d.]+\s+\$[\d.]+\s+([A-Z0-9]{4,})\s+\w+\s+([^\n\d]+?)\s+([\d.]+)\s*$/gm
  let m: RegExpExecArray | null
  while ((m = lineItemRe.exec(text)) !== null) {
    lineItems.push({ code: m[1].trim(), description: m[2].trim(), qty: parseFloat(m[3]) })
  }

  return {
    axusJobNumber: jobNumber,
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
  if (lower.includes('consumable') || lower.includes('toner') || lower.includes('supply') || lower.includes('service')) return 'delivery'
  if (lower.includes('install')) return 'install'
  if (lower.includes('collect') || lower.includes('pickup') || lower.includes('pick-up')) return 'pickup'
  return 'delivery'
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
