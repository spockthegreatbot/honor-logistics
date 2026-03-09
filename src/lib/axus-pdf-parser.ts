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
  // pdf-parse v2 uses a class API: new PDFParse({ data: buffer })
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PDFParse } = require('pdf-parse') as { PDFParse: new (opts: { data: Buffer }) => { getText: () => Promise<{ text: string }> } }
  const parser = new PDFParse({ data: buffer })
  const result = await parser.getText()
  const text = result.text

  // Actual Axus PDF text layout (multi-column table flattened to text stream):
  //   Priority:\nType\nStatus\n{jobNo}\n{dateIn} {priority}\n{type}\n{status}
  //   Codes, phones, company names appear TWICE (customer col + ship-to col)
  //   Machine: "{serial}  Serial #:  {model}  {itemCode}  Item:"

  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0)

  // ── Job number: first standalone 5-6 digit number in the text ─────────────
  const jobNumM = text.match(/\b(\d{5,6})\b/)
  const jobNumber = jobNumM?.[1] ?? ''

  // ── Job type from keyword ─────────────────────────────────────────────────
  const rawType = lines.find(l => /^(Consumable|Installation|Delivery|Service|Collection)$/i.test(l)) ?? ''
  const jobType = mapJobType(rawType)

  // ── Status ────────────────────────────────────────────────────────────────
  const status = lines.find(l => /^(Booked|In Progress|Complete|Cancelled)$/i.test(l)) ?? 'Booked'

  // ── Priority ─────────────────────────────────────────────────────────────
  const priorityM = text.match(/\b(Normal|High|Urgent|Low)\b/i)
  const priority = priorityM?.[1] ?? 'Normal'

  // ── Dates ─────────────────────────────────────────────────────────────────
  const dateDueLine = text.match(/Date Due:\s*\n?(\d{1,2}\/\d{1,2}\/\d{2,4})/i)
  const dateDue = parseDate(dateDueLine?.[1] ?? null)
  const dateOutLine = text.match(/Date Out:\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i)
  const dateOut = parseDate(dateOutLine?.[1] ?? null)

  // ── Customer code: alphanumeric code-like token appearing after Fax: lines ─
  const codeM = text.match(/Tel: Fax:[\s\S]*?\n([A-Z0-9]{4,20})\s/)
  const customerCode = codeM?.[1] ?? ''
  const shipToCode = customerCode // same in most cases

  // ── Company name block: appears after the code/phone lines ────────────────
  // Typically: "CompanyName\nStreet\nSUBURB, STATE POSTCODE"
  // The name appears twice (customer + ship-to columns) — take first occurrence
  const afterCode = codeM ? text.slice(text.indexOf(codeM[1])) : text
  const companyM = afterCode.match(/\n([A-Z][^\n]{5,80})\n[^\n]+?\n([A-Z][A-Z\s,]+\d{4})/)
  const customerName = companyM?.[1]?.trim() ?? ''
  const shipToName = customerName

  // ── Address: street + suburb state postcode ──────────────────────────────
  const addrM = afterCode.match(/([^\n]{5,80})\n([A-Z][A-Z\s,]+(?:NSW|VIC|QLD|SA|WA|TAS|ACT|NT)\s*\d{4})/i)
  const customerAddress = addrM ? `${addrM[1].trim()}, ${addrM[2].trim()}` : ''
  const shipToAddress = customerAddress

  // ── Phone ─────────────────────────────────────────────────────────────────
  const phoneM = text.match(/0[2-9][\d\s]{8,12}/)
  const customerPhone = phoneM?.[0]?.trim() ?? ''
  const shipToPhone = customerPhone

  // ── Attn: appears after "Job#\n" label ────────────────────────────────────
  const attnM = text.match(/Job#\s*\n([^\n]{2,80})/)
  // The name appears twice ("Rob De Cillis Rob De Cillis") — deduplicate
  const rawAttn = attnM?.[1]?.trim() ?? ''
  const attnWords = rawAttn.split(/\s+/)
  const half = Math.floor(attnWords.length / 2)
  const deduped = (half > 0 && attnWords.slice(0, half).join(' ') === attnWords.slice(half).join(' '))
    ? attnWords.slice(0, half).join(' ')
    : rawAttn
  const customerAttn = deduped
  const shipToAttn = deduped

  // ── Machine: "{serial}  Serial #:  {model}  {itemCode}  Item:" ───────────
  const machineLineM = text.match(/(\d{5,8})\s+Serial #:\s+([^\t]+?)\s+([A-Z0-9-]{4,20})\s+Item:/)
  const serialNumber = machineLineM?.[1] ?? ''
  const machineModel = machineLineM?.[2]?.trim() ?? ''
  const machineItemCode = machineLineM?.[3] ?? ''

  // ── Fault ─────────────────────────────────────────────────────────────────
  const fault = extract(text, 'Fault') ?? ''

  // ── Line items: Axus table format ─────────────────────────────────────────
  // Format: "{num} {qty} ${price} ${total}  {CODE} {UNIT}  {Description} {qty}"
  // e.g.: "1 1.00 $0.00 $0.00\tCWAA0986 UNIT\tWaste Toner Bottle 1.00"
  const lineItems: AxusJobData['lineItems'] = []
  const lineItemRe = /\d+\s+[\d.]+\s+\$[\d.]+\s+\$[\d.]+\s+([A-Z0-9-]{4,})\s+\w+\s+([^\t\n]+?)\s+[\d.]+\s*$/gm
  let m: RegExpExecArray | null
  while ((m = lineItemRe.exec(text)) !== null) {
    lineItems.push({ code: m[1].trim(), description: m[2].trim(), qty: 1 })
  }
  // Qty from "Num. Qty." table if present
  if (lineItems.length === 0) {
    // Fallback: look for item code + description pattern
    const fallbackRe = /([A-Z0-9]{6,})\s+(?:UNIT|EA|BOX|CTN|EACH)\s+([^\n]{4,80})/g
    while ((m = fallbackRe.exec(text)) !== null) {
      lineItems.push({ code: m[1].trim(), description: m[2].trim(), qty: 1 })
    }
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
  if (lower.includes('consumable') || lower.includes('toner') || lower.includes('supply')) return 'toner_ship'
  if (lower.includes('install')) return 'install'
  if (lower.includes('collect') || lower.includes('pickup') || lower.includes('pick-up')) return 'collection'
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
