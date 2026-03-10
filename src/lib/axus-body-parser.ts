import type { AxusJobData } from './axus-pdf-parser'

function parseDate(raw: string | null | undefined): string | null {
  if (!raw) return null
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

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/td>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#\d+;/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
}

function firstMatch(text: string, patterns: RegExp[]): string | null {
  for (const p of patterns) {
    const m = text.match(p)
    if (m) return (m[1] ?? m[0]).trim()
  }
  return null
}

/**
 * Parse an Axus job email body (HTML or plain text) and extract job data.
 * Returns null if no job number can be found — the caller should alert manually.
 */
export function parseAxusEmailBody(subject: string, rawBody: string): Partial<AxusJobData> | null {
  // Normalise: strip HTML tags, flatten whitespace
  const plain = stripHtml(rawBody)
  const combined = `${subject}\n${plain}`

  // ── Job number ────────────────────────────────────────────────────────────
  const axusJobNumber = firstMatch(combined, [
    /\[Axus_Group\s+Job#(\d+)\]/i,
    /Job\s*#\s*(\d{4,6})/i,
    /AXUS[- ]?(\d{4,6})/i,
    /Job\s+Number[:\s]+(\d{4,6})/i,
    /\bJob\s+(\d{5,6})\b/i,
  ])

  // Without a job number we can't create a meaningful record
  if (!axusJobNumber) return null

  // ── Job type ──────────────────────────────────────────────────────────────
  const typeMatch = combined.match(/\b(delivery|installation|collection|consumable)\b/i)
  const jobType = typeMatch ? typeMatch[1].toLowerCase() : 'delivery'

  // ── Due date ──────────────────────────────────────────────────────────────
  const rawDate = firstMatch(combined, [
    /[Dd]ue\s*[Dd]ate[:\s]+(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
    /[Dd]elivery\s*[Dd]ate[:\s]+(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
    /[Dd]ate[:\s]+(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
    /(\d{1,2}\/\d{1,2}\/\d{2,4})/,
  ])
  const dateDue = parseDate(rawDate)

  // ── Customer / company name ───────────────────────────────────────────────
  const customerName = firstMatch(combined, [
    /[Cc]ustomer[:\s]+([A-Za-z0-9 &'\-,\.]+)/,
    /[Cc]ompany[:\s]+([A-Za-z0-9 &'\-,\.]+)/,
    /[Bb]ill\s*[Tt]o[:\s]+([A-Za-z0-9 &'\-,\.]+)/,
  ]) ?? ''

  // ── Ship-to / delivery address ────────────────────────────────────────────
  const shipToAddress = firstMatch(combined, [
    /[Dd]eliver\s*[Tt]o[:\s]+([^\n]+)/,
    /[Ss]hip\s*[Tt]o\s*[Aa]ddress[:\s]+([^\n]+)/,
    /[Ss]ite\s*[Aa]ddress[:\s]+([^\n]+)/,
    /[Aa]ddress[:\s]+([^\n]+)/,
  ]) ?? ''

  const shipToName = firstMatch(combined, [
    /[Ss]hip\s*[Tt]o\s*[Nn]ame[:\s]+([^\n]+)/,
    /[Aa]ttn[:\s]+([^\n]+)/,
    /[Dd]elivery\s*[Cc]ontact[:\s]+([^\n]+)/,
  ]) ?? customerName

  // ── Contact ───────────────────────────────────────────────────────────────
  const shipToAttn = firstMatch(combined, [
    /[Cc]ontact[:\s]+([A-Za-z ]+?)(?:\s*[Pp]h|\s*[Tt]el|\s*\n)/,
    /[Aa]ttn[:\s]+([^\n]+)/,
  ]) ?? ''

  const shipToPhone = firstMatch(combined, [
    /[Pp]hone[:\s]+([\d\s\+\-\(\)]{8,15})/,
    /[Pp]h[:\s]+([\d\s\+\-\(\)]{8,15})/,
    /[Tt]el[:\s]+([\d\s\+\-\(\)]{8,15})/,
    /(\b04\d{8}\b)/,
    /(\b0[2378]\d{8}\b)/,
  ]) ?? ''

  // ── Machine model & serial ────────────────────────────────────────────────
  const machineModel = firstMatch(combined, [
    /[Mm]odel[:\s]+([A-Za-z0-9\- ]+?)(?:\n|S\/N|[Ss]erial)/,
    /[Mm]achine[:\s]+([A-Za-z0-9\- ]+?)(?:\n|S\/N|[Ss]erial)/,
    /[Pp]rinter\s+[Mm]odel[:\s]+([^\n]+)/,
  ]) ?? ''

  const serialNumber = firstMatch(combined, [
    /[Ss]erial\s*(?:[Nn]umber|[Nn]o\.?|#)[:\s]+([A-Za-z0-9\-]+)/,
    /S\/N[:\s]+([A-Za-z0-9\-]+)/,
  ]) ?? ''

  // ── Line items ─────────────────────────────────────────────────────────────
  // Look for lines matching: optional code, description, optional qty
  const lineItems: AxusJobData['lineItems'] = []
  const lineItemRegex = /\b([A-Z]{2,6}-\d{3,8})\b[:\s]+([^\n]+?)(?:\s+[xX]?(\d+))?\s*(?:\n|$)/g
  let lim: RegExpExecArray | null
  while ((lim = lineItemRegex.exec(plain)) !== null) {
    lineItems.push({
      code: lim[1],
      description: lim[2].trim(),
      qty: lim[3] ? parseInt(lim[3], 10) : 1,
    })
  }

  return {
    axusJobNumber,
    jobType,
    status: 'new',
    dateDue,
    dateOut: null,
    priority: 'normal',
    customerName,
    customerCode: '',
    customerAddress: '',
    customerPhone: shipToPhone,
    customerAttn: shipToAttn,
    shipToName,
    shipToCode: '',
    shipToAddress,
    shipToPhone,
    shipToAttn,
    machineItemCode: '',
    machineModel,
    serialNumber,
    fault: '',
    lineItems,
  }
}
