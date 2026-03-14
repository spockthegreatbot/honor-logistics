#!/usr/bin/env node
// Run directly on VPS: node scripts/poll-emails.mjs
import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import mammoth from 'mammoth'
import { isRunupJobRequest, parseRunupEmail } from './parse-runup-email.mjs'
import { PDFParse } from 'pdf-parse'
import { parsePackingListText } from './parse-runup-pdf.mjs'

// Load env from .env.local
const envFile = new URL('../.env.local', import.meta.url).pathname
const envVars = readFileSync(envFile, 'utf8').split('\n').reduce((acc, line) => {
  const m = line.match(/^([^=]+)=(.*)$/)
  if (m) acc[m[1].trim()] = m[2].trim()
  return acc
}, {})

const IMAP_HOST = envVars.IMAP_HOST
const IMAP_PORT = Number(envVars.IMAP_PORT ?? 993)
const IMAP_USER = envVars.IMAP_USER
const IMAP_PASS = envVars.IMAP_PASS
const SUPABASE_URL = envVars.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = envVars.SUPABASE_SERVICE_ROLE_KEY
const BOT_TOKEN = envVars.HONOR_BOT_TOKEN
const GROUP_CHAT_ID = envVars.HONOR_GROUP_CHAT_ID

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

/**
 * Parse a Kyocera packing list PDF buffer into structured data.
 * Uses pdf-parse to extract text, then parsePackingListText for structure.
 */
async function parsePackingListFromPdf(pdfBuffer) {
  try {
    const parser = new PDFParse({ data: pdfBuffer })
    const result = await parser.getText()
    const fullText = result.text ?? ''
    if (!fullText.trim()) return null
    return parsePackingListText(fullText)
  } catch (e) {
    console.error('  PDF text extraction error:', e.message)
    return null
  }
}

async function sendTelegram(text) {
  if (!BOT_TOKEN || !GROUP_CHAT_ID) return
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: GROUP_CHAT_ID, text, parse_mode: 'HTML' }),
  }).catch(e => console.error('Telegram error:', e.message))
}

const SKIP_REFS = new Set(['example', 'here', 'this', 'note', 'info', 'email', 'http', 'https', 'customer', 'order', 'booking', 'type', 'date', 'reference', 'contact', 'address', 'serial'])

function extractEfexReference(text) {
  const patterns = [
    /EFX[- ]?(\d+)/i,
    /#(\d{5,})/,
    /order[:\s#]+(\d{4,})/i,
    /booking[:\s#]+([A-Z0-9-]{5,})/i,
    /ref(?:erence)?[:\s#]+([A-Z0-9-]{5,})/i,
    /job[:\s#]+([A-Z0-9-]{5,})/i,
  ]
  for (const p of patterns) {
    const m = (text || '').match(p)
    if (m) {
      const val = m[1].toLowerCase()
      if (!SKIP_REFS.has(val) && !/^(https?|ftp)$/i.test(val)) return m[1]
    }
  }
  return null
}

function extractField(text, ...labels) {
  for (const label of labels) {
    const re = new RegExp(`${label}[:\\s]*([^\\n\\r]{2,80})`, 'i')
    const m = text.match(re)
    if (m) {
      const val = m[1].trim().replace(/\s+/g, ' ')
      if (val && val.length > 1) return val
    }
  }
  return null
}

function detectOrderTypes(text) {
  const t = text.toLowerCase()
  const types = []
  if (/deliv(ery)?/.test(t)) types.push('delivery')
  if (/install/.test(t)) types.push('installation')
  if (/pick.?up|collection/.test(t)) types.push('pickup')
  if (/reloc/.test(t)) types.push('relocation')
  return [...new Set(types)]
}

function extractDate(text) {
  const m1 = text.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/)
  if (m1) return `${m1[3]}-${m1[2].padStart(2,'0')}-${m1[1].padStart(2,'0')}`
  const months = { jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12' }
  const m2 = text.match(/(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{4})/i)
  if (m2) { const mo = months[m2[2].toLowerCase().slice(0,3)]; return mo ? `${m2[3]}-${mo}-${m2[1].padStart(2,'0')}` : null }
  return null
}

// ── DOCX parsing ─────────────────────────────────────────────────────────────

async function extractDocxData(buffer) {
  try {
    const [rawResult, htmlResult] = await Promise.all([
      mammoth.extractRawText({ buffer }),
      mammoth.convertToHtml({ buffer }),
    ])
    return { raw: rawResult.value ?? '', html: htmlResult.value ?? '' }
  } catch (e) {
    console.error('  docx parse error:', e.message)
    return { raw: '', html: '' }
  }
}

// Sanitize extracted values — null out empty, "null", "N/A", "-"
const cleanVal = (v) => (!v || v === 'null' || v.trim() === '' || v === 'N/A' || v === 'n/a' || v === '-') ? null : v.trim()

// Parse the EFEX "Pick-Up / Delivery Install Request" form using HTML table structure
function parseEfexForm({ raw, html }, subject = '') {
  // Extract all <td> cell contents as clean text
  const cells = []
  const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/gi
  let m
  while ((m = tdRe.exec(html)) !== null) {
    const cellText = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    cells.push(cellText)
  }

  // Normalize cell text for label comparison
  const norm = (s) => s.toUpperCase().replace(/[^A-Z0-9\s\/&]/g, '').replace(/\s+/g, ' ').trim()

  // Known header keywords — a value that's entirely composed of these is likely a label, not data
  const HEADER_WORDS = /^(MODEL|PART|NUMBER|ACCESSORIES|ACCESSORY|SERIAL|S\/N|NO|RECYCLE|REFURB|LOAN|SCRAP|PICK.?UP|DELIVERY|INSTALL|COLLECTION|ORDER|TYPE|DATE|ADDRESS|CONTACT|CUSTOMER|COMPANY|CLIENT|COMMENT|YES|NO|NAME|PHONE|EMAIL|STAIR|WALKER|PARKING|DISPOSITION|IDCA|SPECIAL|INSTRUCTIONS|TIME|BEST|SITE|ON|AND|OR|OF|THE|&|\/|\s)+$/i

  // Check if a cell looks like a header/label rather than actual data
  function looksLikeHeader(v) {
    if (!v) return false
    return HEADER_WORDS.test(v.trim())
  }

  // Find the first non-empty value cell after a label cell at index i
  // Skips empty cells and cells that look like headers, checks up to N+3
  function valueAfter(i) {
    for (let offset = 1; offset <= 3 && i + offset < cells.length; offset++) {
      const v = cells[i + offset]?.trim()
      if (v && v.length > 0 && !looksLikeHeader(v)) return v
    }
    return null
  }

  // Search cells for a label matching any variant, return the value from the next non-empty cell
  // opts.excludePrefix: skip cells whose norm starts with this prefix (e.g. 'PICKUP' to avoid pickup section)
  function get(labels, opts = {}) {
    if (typeof labels === 'string') labels = [labels]
    const upperLabels = labels.map(l => norm(l))
    const excl = opts.excludePrefix ? norm(opts.excludePrefix) : null
    for (let i = 0; i < cells.length; i++) {
      const cellNorm = norm(cells[i])
      if (cellNorm.length < 2 || cellNorm.length > 60) continue
      if (excl && cellNorm.startsWith(excl)) continue
      for (const label of upperLabels) {
        if (cellNorm === label || cellNorm.includes(label)) {
          const v = cleanVal(valueAfter(i))
          if (v && v.length > 1) return v
        }
      }
    }
    return null
  }

  // Convenience: get with varargs (original signature, no options)
  function getAny(...labels) { return get(labels) }

  // Customer — try multiple label variants
  const customerRaw = getAny('CUSTOMER', 'COMPANY NAME', 'COMPANY', 'CLIENT NAME', 'CLIENT', 'CUSTOMER NAME')
  const customerName = cleanVal(customerRaw?.split(/ORDER TYPE|DELIVERY DATE|BEST CONTACT/i)[0]?.trim()) || cleanVal(customerRaw)

  // Order types: look at ORDER TYPE row cells for ☑ or bold/checked markers
  // EFEX docx uses Word checkbox controls — we look for cell patterns
  const orderTypeIdx = cells.findIndex(c => /order\s*type/i.test(c))
  const orderTypes = []
  if (orderTypeIdx >= 0) {
    // Next cells are the type options — checked ones may have ☑ or appear as separate short cells
    const slice = cells.slice(orderTypeIdx + 1, orderTypeIdx + 8).join(' ')
    // Word form checkboxes render as ☐ (unchecked U+2610) or ☑ (checked U+2611)
    if (/☑[^☑☐]*DELIVERY|DELIVERY[^☑☐]*☑/i.test(slice)) orderTypes.push('delivery')
    if (/☑[^☑☐]*INSTALL|INSTALL[^☑☐]*☑/i.test(slice)) orderTypes.push('installation')
    if (/☑[^☑☐]*PICK|PICK[^☑☐]*☑/i.test(slice)) orderTypes.push('pickup')
    if (/☑[^☑☐]*RELOC|RELOC[^☑☐]*☑/i.test(slice)) orderTypes.push('relocation')
  }
  // Fallback: derive from subject line (most reliable — EFEX includes type in subject)
  if (orderTypes.length === 0) {
    const s = subject.toUpperCase()
    if (/COLLECTION/.test(s)) orderTypes.push('pickup')
    if (/INSTALL/.test(s)) orderTypes.push('installation')
    if (/RELOCATION/.test(s)) orderTypes.push('relocation')
    if (/DELIVERY/.test(s) && !orderTypes.includes('delivery')) orderTypes.push('delivery')
    // Install bookings from EFEX are always delivery + installation
    if (orderTypes.includes('installation') && !orderTypes.includes('delivery')) orderTypes.unshift('delivery')
  }

  // Date
  const dateRaw = getAny('DELIVERY DATE', 'INSTALL DATE', 'COLLECTION DATE', 'PICKUP DATE', 'DATE')
  const scheduledDate = (dateRaw ? extractDate(dateRaw) : null) ?? extractDate(subject)

  // Contact — "Celia - 02 8890 7484"
  const contactRaw = getAny('BEST CONTACT', 'CONTACT ON SITE', 'CONTACT NAME & NUMBER', 'CONTACT NAME', 'CONTACT NUMBER', 'CONTACT')
  let contactName = null, contactPhone = null
  if (contactRaw) {
    const phoneM = contactRaw.match(/(\(?\d[\d\s\-\(\)]{7,})/)
    if (phoneM) {
      contactPhone = cleanVal(phoneM[1])
      contactName = cleanVal(contactRaw.slice(0, phoneM.index).replace(/[-,\s]+$/, ''))
    } else {
      contactName = cleanVal(contactRaw.slice(0, 80))
    }
  }

  // Machine — try multiple label strategies
  let machineModel = null, machineSerial = null, machineAccessories = null

  // Strategy 1: Original header-row approach (MODEL/PART NUMBER + ACCESSORIES + SERIAL in a header row)
  const modelLabelIdx = cells.findIndex(c => /model.*part/i.test(c))
  if (modelLabelIdx >= 0) {
    // Count how many header cells follow in this row (look for ACCESSORIES, SERIAL labels)
    let headerCount = 1
    for (let j = modelLabelIdx + 1; j < Math.min(modelLabelIdx + 5, cells.length); j++) {
      const cn = norm(cells[j])
      if (/ACCESSOR|SERIAL/.test(cn)) headerCount++
      else break
    }
    const dataStart = modelLabelIdx + headerCount
    machineModel = cleanVal(cells[dataStart])
    if (headerCount >= 3) {
      machineAccessories = cleanVal(cells[dataStart + 1])
      machineSerial = cleanVal(cells[dataStart + 2])
    } else if (headerCount === 2) {
      machineSerial = cleanVal(cells[dataStart + 1])
    }
    // Clean up — remove trailing label words that leaked into values
    if (machineModel) machineModel = cleanVal(machineModel.replace(/ACCESSORIES|SERIAL|INSTALL|ADDRESS/gi, ''))
    if (machineSerial) machineSerial = cleanVal(machineSerial.replace(/INSTALL|ADDRESS|YES|NO/gi, ''))
  }

  // Strategy 2: Individual label search fallback (for COLLECTION forms and GME)
  // Exclude pickup-prefixed cells to avoid mixing up delivery vs pickup fields
  const noPickup = { excludePrefix: 'PICKUP' }
  if (!machineModel) {
    machineModel = cleanVal(get(['MODEL', 'MACHINE MODEL', 'MODEL NO', 'MODEL NUMBER', 'PART NUMBER', 'MODEL / PART NUMBER', 'MODEL/PART'], noPickup))
  }
  if (!machineSerial) {
    machineSerial = cleanVal(get(['SERIAL', 'SERIAL NO', 'SERIAL NUMBER', 'S/N', 'SERIAL #'], noPickup))
  }
  if (!machineAccessories) {
    machineAccessories = cleanVal(get(['ACCESSORIES', 'ACCESSORY', 'ACCESSORY PART NUMBER', 'ACCESSORY PART', 'ACC', 'ACCESSORIES PART NUMBER'], noPickup))
  }

  // Install IDCA — parser unreliable, always null (set manually in CRM)
  const installIdca = null

  // Address
  const addressRaw = getAny('ADDRESS', 'DELIVERY ADDRESS', 'SITE ADDRESS', 'INSTALL ADDRESS', 'COLLECTION ADDRESS')
  const address = cleanVal(addressRaw?.slice(0, 200))

  // Stair walker / parking
  const stairRaw = getAny('STAIR WALKER', 'STAIRWALKER')
  const parkRaw = getAny('PARKING')
  let stairWalker = null, parkingYn = null
  if (stairRaw) {
    if (/\bYES\b/i.test(stairRaw) && !/\bNO\b/i.test(stairRaw)) stairWalker = true
    else if (/\bNO\b/i.test(stairRaw)) stairWalker = false
  }
  if (parkRaw) {
    if (/\bYES\b/i.test(parkRaw) && !/\bNO\b/i.test(parkRaw)) parkingYn = true
    else if (/\bNO\b/i.test(parkRaw)) parkingYn = false
  }
  const stairComment = cleanVal(stairRaw?.replace(/YES|NO|COMMENT[:;]?\s*/gi, ''))
  const parkComment = cleanVal(parkRaw?.replace(/YES|NO|COMMENT[:;]?\s*/gi, ''))

  // Pick-up section
  const pickupLabelIdx = cells.findIndex(c => /pick.?up\s*model/i.test(c))
  let pickupModel = null, pickupAccessories = null, pickupSerial = null, pickupDisposition = null
  if (pickupLabelIdx >= 0) {
    const dataStart = pickupLabelIdx + 4 // after 4 header cells
    pickupModel = cleanVal(cells[dataStart])
    pickupAccessories = cleanVal(cells[dataStart + 1])
    pickupSerial = cleanVal(cells[dataStart + 2])
    pickupDisposition = cleanVal(cells[dataStart + 3])
  }

  // Special instructions
  const siRaw = raw.match(/SPECIAL\s*INSTRUCTIONS[:\s]*([^\n]{5,}(?:\n(?!^[A-Z\s]+:)[^\n]*)*)/im)
  const specialInstructions = cleanVal(siRaw?.[1]?.slice(0, 400)) ?? cleanVal(getAny('SPECIAL INSTRUCTIONS'))

  // EFEX reference — only accept numeric refs
  const efexRef = (() => {
    const m = raw.match(/EFEX\s*REFERENCE[#:\s]*(\d{4,})/i) ??
              raw.match(/#\s*(\d{5,})/) ??
              raw.match(/REF(?:ERENCE)?[#:\s]+(\d{4,})/i)
    return m?.[1] ?? null
  })()

  // Phone validation: Australian phone pattern
  const auPhoneRe = /^(\+?61|0)[0-9\s\-\(\)]{7,14}$/
  const cleanedPhone = cleanVal(contactPhone?.replace(/\s+/g, ' ').slice(0, 20))
  const validPhone = (cleanedPhone && auPhoneRe.test(cleanedPhone.trim())) ? cleanedPhone : null

  // Contact name cleanup: trim trailing dashes
  const cleanedContactName = cleanVal(contactName?.slice(0, 80))?.replace(/[\s]*[–—-]+[\s]*$/, '').trim() || null

  return {
    customerName: cleanVal(customerName?.slice(0, 120)),
    orderTypes,
    scheduledDate,
    contactName: cleanedContactName,
    contactPhone: validPhone,
    machineModel: cleanVal(machineModel?.slice(0, 100)),
    machineSerial: cleanVal(machineSerial?.slice(0, 50)),
    machineAccessories: cleanVal(machineAccessories?.slice(0, 100)),
    installIdca,
    address: cleanVal(address?.slice(0, 200)),
    stairWalker,
    stairWalkerComment: cleanVal(stairComment?.slice(0, 100)),
    parking: parkingYn,
    parkingComment: cleanVal(parkComment?.slice(0, 100)),
    pickupModel: cleanVal(pickupModel?.slice(0, 100)),
    pickupSerial: cleanVal(pickupSerial?.slice(0, 50)),
    pickupAccessories: cleanVal(pickupAccessories?.slice(0, 100)),
    pickupDisposition: cleanVal(pickupDisposition?.slice(0, 50)),
    specialInstructions: cleanVal(specialInstructions?.slice(0, 400)),
    efexRef,
  }
}

// ── PDF parsing for EFEX booking forms ────────────────────────────────────────

async function extractPdfData(buffer) {
  try {
    const parser = new PDFParse({ data: buffer })
    const result = await parser.getText()
    const raw = result.text ?? ''
    // Build a pseudo-HTML table structure from the PDF text so parseEfexForm can reuse
    // its cell-based extraction. Each line becomes a <td>.
    const lines = raw.split('\n').map(l => l.trim()).filter(l => l.length > 0)
    const html = '<table>' + lines.map(l => `<tr><td>${l}</td></tr>`).join('') + '</table>'
    return { raw, html }
  } catch (e) {
    console.error('  PDF parse error:', e.message)
    return { raw: '', html: '' }
  }
}

// Map EFEX order type labels to valid job_type constraint values
const ORDER_TYPE_MAP = {
  delivery: 'delivery',
  installation: 'install',
  pickup: 'collection',
  relocation: 'delivery',  // closest valid type
  collection: 'collection',
}

// ── Axus PDF parser ───────────────────────────────────────────────────────────

function axusParseDate(raw) {
  if (!raw) return null
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (!m) return null
  const day = m[1].padStart(2, '0')
  const month = m[2].padStart(2, '0')
  let year = m[3]
  if (year.length === 2) year = (parseInt(year) >= 50 ? '19' : '20') + year
  return `${year}-${month}-${day}`
}

function axusExtract(text, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = text.match(new RegExp(`${escaped}[:\\s]+([^\\n]+)`, 'i'))
  return m ? m[1].trim() : null
}

function axusExtractBlock(text, startLabel, endLabel) {
  const startIdx = text.search(new RegExp(startLabel + '[:\\s]', 'i'))
  if (startIdx === -1) return ''
  const endIdx = endLabel ? text.search(new RegExp(endLabel + '[:\\s]', 'i')) : text.length
  return endIdx > startIdx ? text.slice(startIdx, endIdx) : text.slice(startIdx)
}

function axusBlockField(block, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = block.match(new RegExp(`${escaped}[:\\s]+([^\\n|]+)`, 'i'))
  return m ? m[1].trim() : null
}

function axusMapJobType(raw) {
  const lower = raw.toLowerCase()
  if (lower.includes('consumable') || lower.includes('toner') || lower.includes('supply')) return 'toner'
  if (lower.includes('install')) return 'install'
  if (lower.includes('collect') || lower.includes('pickup') || lower.includes('pick-up')) return 'pickup'
  return 'delivery'
}

async function parseAxusJobPdf(buffer, subject = '') {
  const parser = new PDFParse({ data: buffer })
  const result = await parser.getText()
  const text = result.text

  // Axus PDFs are two-column — pdf-parse interleaves both columns into one text stream.
  // Column data appears duplicated (company name, phone, address appear twice).

  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0)

  // ── Job number: try subject first (most reliable), then first 5-6 digit number in text ──
  const subjectJobM = subject.match(/\[Axus_Group\s+Job#?(\d+)/i)
  const pdfJobM = text.match(/\b(\d{5,6})\b/)
  const jobNumber = subjectJobM?.[1] ?? pdfJobM?.[1] ?? ''

  // ── Job type ──────────────────────────────────────────────────────────────
  const rawType = text.match(/^(Consumable|Installation|Delivery|Service|Collection)$/mi)?.[1] ?? ''
  const jobType = axusMapJobType(rawType)

  // ── Status ────────────────────────────────────────────────────────────────
  const status = text.match(/^(Booked|In Progress|Complete|Cancelled)$/mi)?.[1] ?? 'Booked'

  // ── Priority ─────────────────────────────────────────────────────────────
  const priority = text.match(/\b(Normal|High|Urgent|Low)\b/i)?.[1] ?? 'Normal'

  // ── Dates ─────────────────────────────────────────────────────────────────
  const dateDue = axusParseDate(text.match(/Date Due:[\s\S]*?(\d{1,2}\/\d{1,2}\/\d{2,4})/)?.[1] ?? null)
  const dateOut = axusParseDate(text.match(/Date Out:\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i)?.[1] ?? null)

  // ── Phone: appears duplicated "0296425444\t0296425444" — take first part ──
  const phoneRaw = text.match(/0[2-9][\d ]{7,10}/)?.[0]?.split(/[\s\t]+/)?.[0]?.trim() ?? ''
  const customerPhone = phoneRaw
  const shipToPhone = phoneRaw

  // ── Customer/Ship code ────────────────────────────────────────────────────
  const customerCode = text.match(/Code:[\s\t]*Code:[\s\S]*?\n([A-Z0-9]{4,20})/)?.[1] ?? ''
  const shipToCode = customerCode

  // ── Two-block address parser: finds customer (billing) vs ship-to (delivery) ──
  const phoneLineIdx = lines.findIndex(l => /^0[2-9][\d\s]{7,}/.test(l))
  const afterPhone = phoneLineIdx >= 0 ? lines.slice(phoneLineIdx + 1) : []

  const stateLineIdxs = afterPhone
    .map((l, i) => /(?:NSW|VIC|QLD|SA|WA|TAS|ACT|NT)\s*\d{4}/.test(l) ? i : -1)
    .filter(i => i >= 0)

  let customerName = '', customerAddress = ''
  let shipToName = '', shipToAddress = ''

  if (stateLineIdxs.length >= 2) {
    // Two blocks: first = customer (billing), second = ship-to (delivery)
    customerName = afterPhone[0] ?? ''
    const custStreet = afterPhone.slice(1, stateLineIdxs[0]).join(', ')
    customerAddress = custStreet ? custStreet + ', ' + afterPhone[stateLineIdxs[0]] : afterPhone[stateLineIdxs[0]] ?? ''

    shipToName = afterPhone[stateLineIdxs[0] + 1] ?? ''
    const shipStreet = afterPhone.slice(stateLineIdxs[0] + 2, stateLineIdxs[1]).join(', ')
    shipToAddress = shipStreet ? shipStreet + ', ' + afterPhone[stateLineIdxs[1]] : afterPhone[stateLineIdxs[1]] ?? ''
  } else if (stateLineIdxs.length === 1) {
    // One block: customer = ship-to
    customerName = afterPhone[0] ?? ''
    const street = afterPhone.slice(1, stateLineIdxs[0]).join(', ')
    const suburb = afterPhone[stateLineIdxs[0]] ?? ''
    customerAddress = street ? street + ', ' + suburb : suburb
    shipToName = customerName
    shipToAddress = customerAddress
  }

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
  const fault = text.match(/Fault:\s*([^\n]+)/)?.[1]?.trim() ?? ''

  // ── Line items: "$price $total\tCODE UNIT\tDescription qty" ───────────────
  const lineItems = []
  const lineItemRe = /\$[\d.]+\s+\$[\d.]+\s+([A-Z0-9]{4,})\s+\w+\s+([^\n\d]+?)\s+([\d.]+)\s*$/gm
  let m
  while ((m = lineItemRe.exec(text)) !== null) {
    lineItems.push({ code: m[1].trim(), description: m[2].trim(), qty: parseFloat(m[3]) })
  }

  return {
    axusJobNumber: jobNumber,
    jobType, status, dateDue, dateOut, priority,
    customerName, customerCode, customerAddress, customerPhone, customerAttn,
    shipToName, shipToCode, shipToAddress, shipToPhone, shipToAttn,
    machineItemCode, machineModel, serialNumber, fault, lineItems,
  }
}

// ── Upload helper ──────────────────────────────────────────────────────────────

async function uploadToSupabase(folder, filename, buffer, contentType) {
  const bucket = 'job-documents'
  const timestamp = Date.now()
  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_')
  const storagePath = `${folder}/${timestamp}_${safeFilename}`

  await supabase.storage.createBucket(bucket, { public: false, fileSizeLimit: 20971520 }).catch(() => {})
  const { error } = await supabase.storage.from(bucket).upload(storagePath, buffer, { contentType, upsert: false })
  if (error) { console.error(`  Upload error: ${error.message}`); return null }
  const { data: signed } = await supabase.storage.from(bucket).createSignedUrl(storagePath, 60 * 60 * 24 * 365)
  return signed?.signedUrl ?? null
}

// ─────────────────────────────────────────────────────────────────────────────

const SKIP_DOMAINS = ['xero.com', 'post.xero.com', 'myob.com', 'quickbooks.com', 'stripe.com', 'dominos.com.au']
const EFEX_JOB_DOMAINS = ['efex.com.au']
const SPAM_INDICATORS = ['***SPAM***', 'unsubscribe', 'SEO report', '4K', 'channels', 'website design']

// EFEX job emails always match: "Efex / [Customer] [TYPE] - [DD-MM-YYYY]"
// or "RE: Efex / ..." (replies). Only accept this exact pattern — no domain-wide catch-all.
const EFEX_SUBJECT_RE = /^(re:\s*)?(fwd?:\s*)?efex\s*\/\s*.+?(delivery|install|collection|pickup|pick[-\s]?up|relocation|toner|consumable)/i

function isEfexJobRequest(subject, body, fromEmail, hasDocxOrPdf = false) {
  // Must be from @efex.com.au domain
  const domain = (fromEmail || '').split('@')[1]?.toLowerCase() ?? ''
  const isEfexDomain = EFEX_JOB_DOMAINS.some(d => domain === d || domain.endsWith('.' + d))
  if (!isEfexDomain) return false

  // Skip spam indicators
  if (SPAM_INDICATORS.some(s => subject.includes(s))) return false

  // If it has a DOCX or PDF booking form attachment → definitely a job request
  if (hasDocxOrPdf) return true

  // Otherwise require the subject to match the EFEX job pattern exactly
  // This prevents newsletters, promotions, and other @efex.com.au emails from becoming jobs
  return EFEX_SUBJECT_RE.test(subject.trim())
}

function isMitronicsJobRequest(subject, body, fromEmail) {
  const domain = (fromEmail || '').split('@')[1]?.toLowerCase() ?? ''
  return domain.includes('mitronics.com.au')
}

async function createMitronicsJob(body, subject, fromEmail, fromName) {
  try {
    const { data: mitronicsClient } = await supabase.from('clients').select('id').ilike('name', '%mitronics%').limit(1).single()
    if (!mitronicsClient?.id) {
      console.log('  ⚠️  Mitronics client not found in DB — skipping insert (Onur needs to add client first)')
      return null
    }
    const clientId = mitronicsClient.id

    // Dedup by subject
    const normSubject = subject.replace(/^(fwd?|fw)[:\s]*/gi, '').trim().slice(0, 80)
    const { data: existing } = await supabase.from('jobs').select('id, job_number')
      .ilike('notes', `%${normSubject.slice(0, 40)}%`).limit(1).single()
    if (existing?.id) {
      console.log(`  ⚠️  Already exists: ${existing.job_number} (subject match)`)
      return { id: existing.id, job_number: existing.job_number, duplicate: true }
    }

    // Generate job number
    const year = new Date().getFullYear()
    const { data: lastJob } = await supabase.from('jobs')
      .select('job_number').ilike('job_number', `HRL-${year}-%`)
      .order('job_number', { ascending: false }).limit(1).single()
    const lastSeq = lastJob?.job_number ? parseInt(lastJob.job_number.split('-')[2] ?? '0') : 0
    const jobNumber = `HRL-${year}-${String(lastSeq + 1).padStart(4, '0')}`

    const { data: newJob, error } = await supabase.from('jobs').insert({
      job_number: jobNumber,
      job_type: 'delivery',
      status: 'pending_review',
      client_id: clientId,
      notes: `Auto-created from Mitronics email — review and update fields as needed.\nFrom: ${fromName} <${fromEmail}>\nSubject: ${subject}\n\n${body.slice(0, 500)}`,
    }).select('id, job_number').single()

    if (error) throw error

    // Auto-attach to open billing cycle
    if (newJob?.id && clientId) {
      const { data: openCycle } = await supabase
        .from('billing_cycles')
        .select('id')
        .eq('client_id', clientId)
        .eq('status', 'open')
        .order('period_start', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (openCycle?.id) {
        await supabase.from('jobs').update({ billing_cycle_id: openCycle.id }).eq('id', newJob.id)
        console.log(`  📎 Auto-attached to billing cycle ${openCycle.id}`)
      }
    }

    return { ...newJob, duplicate: false }
  } catch (e) {
    console.error('  ❌ Mitronics create error:', e.message)
    return null
  }
}

async function createJobFromEmail(body, subject, docx = null, bookingFormUrl = null) {
  try {
    const { data: efexClient } = await supabase.from('clients').select('id').ilike('name', '%efex%').limit(1).single()
    const clientId = efexClient?.id ?? null

    const combined = subject + '\n' + body

    // Prefer docx fields over email body parsing
    const d = docx ?? {}
    const orderTypes = (d.orderTypes?.length > 0) ? d.orderTypes : detectOrderTypes(combined)
    const jobType = ORDER_TYPE_MAP[orderTypes[0]] ?? 'delivery'
    const ref = d.efexRef ?? extractEfexReference(combined)
    let contactName = d.contactName ?? extractField(combined, 'contact', 'best contact', 'contact person', 'attn')
    // Clean trailing dashes from contact name
    if (contactName) contactName = contactName.replace(/[\s]*[–—-]+[\s]*$/, '').trim() || null

    let contactPhone = d.contactPhone ?? extractField(combined, 'phone', 'mobile', 'tel', 'contact number')
    // Validate Australian phone format — reject garbage text
    const auPhonePattern = /^(\+?61|0)[0-9\s\-\(\)]{7,14}$/
    if (contactPhone && !auPhonePattern.test(contactPhone.trim())) contactPhone = null
    const scheduledDate = d.scheduledDate ?? extractDate(subject) ?? extractDate(combined)
    const scheduledTime = extractField(combined, 'time', 'delivery time', 'arrival time')
    const machineSerial = cleanVal(d.machineSerial ?? extractField(combined, 'serial', 's/n', 'serial number'))
    const machineAccessories = cleanVal(d.machineAccessories) ?? null
    let addressTo = d.address ?? extractField(combined, 'delivery address', 'address', 'site address')
    // Address fallback: scan email body for lines with a state abbreviation + postcode
    if (!addressTo) {
      const statePostcodeRe = /^(.+(?:NSW|VIC|QLD|WA|SA|ACT|TAS|NT)\s*\d{4}.*)$/im
      const lines = combined.split('\n')
      for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed.length > 5 && trimmed.length < 200 && statePostcodeRe.test(trimmed)) {
          addressTo = cleanVal(trimmed.slice(0, 200))
          break
        }
      }
    }
    const addressFrom = (orderTypes.includes('relocation') ? d.addressFrom ?? extractField(combined, 'collect from', 'pickup from') : null)
    const specialInstructions = d.specialInstructions ?? extractField(combined, 'special instructions', 'comments')
    const stairWalker = d.stairWalker ?? null
    const stairWalkerComment = d.stairWalkerComment ?? null
    const parking = d.parking ?? null
    const parkingComment = d.parkingComment ?? null
    const installIdca = d.installIdca ?? null
    const pickupModel = d.pickupModel ?? null
    const pickupSerial = d.pickupSerial ?? null
    const pickupAccessories = d.pickupAccessories ?? null
    const pickupDisposition = d.pickupDisposition ?? null
    const machineModel = cleanVal(d.machineModel ?? extractField(combined, 'model', 'machine', 'part'))

    // Check for duplicate — by ref if reliable, else by subject
    if (ref && ref.length >= 5 && !SKIP_REFS.has(ref.toLowerCase())) {
      const { data: existing } = await supabase.from('jobs').select('id, job_number').ilike('client_reference', `%${ref}%`).limit(1).single()
      if (existing?.id) {
        console.log(`  ⚠️  Already exists: ${existing.job_number} (ref ${ref})`)
        return { id: existing.id, job_number: existing.job_number, duplicate: true }
      }
    } else if (subject) {
      // Dedup by subject line (normalized)
      const normSubject = subject.replace(/^(fwd?|fw)[:\s]*/gi, '').trim().slice(0, 80)
      const { data: existing } = await supabase.from('jobs').select('id, job_number')
        .ilike('notes', `%${normSubject.slice(0, 40)}%`).limit(1).single()
      if (existing?.id) {
        console.log(`  ⚠️  Already exists: ${existing.job_number} (subject match)`)
        return { id: existing.id, job_number: existing.job_number, duplicate: true }
      }
    }

    // Use source job number: efexRef if available, else derive from subject
    let jobNumber
    if (d.efexRef) {
      jobNumber = d.efexRef
    } else {
      // Extract customer + date from EFEX subject: "Efex / {Customer} - {TYPE} - {DD-MM-YYYY}"
      const efexSubjectM = subject.match(/Efex\s*\/\s*([^-]+?)\s*-\s*[^-]+?\s*-\s*(\d{2})-(\d{2})-(\d{4})/i)
      if (efexSubjectM) {
        const customer = efexSubjectM[1].trim().replace(/\s+/g, '')
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
        const monthStr = months[parseInt(efexSubjectM[3], 10) - 1] ?? efexSubjectM[3]
        jobNumber = `EFEX-${customer}-${efexSubjectM[2]}${monthStr}${efexSubjectM[4]}`
      } else {
        const normSubj = subject.replace(/[^a-zA-Z0-9]/g, '').slice(0, 20)
        jobNumber = `EFEX-${normSubj}`
      }
    }

    // Duplicate check by job_number
    {
      const { data: existingByNum } = await supabase
        .from('jobs')
        .select('id, job_number')
        .eq('job_number', jobNumber)
        .limit(1)
      if (existingByNum?.length > 0) {
        console.log(`  [SKIP] Duplicate job: ${jobNumber} already exists`)
        return { id: existingByNum[0].id, job_number: existingByNum[0].job_number, duplicate: true }
      }
    }

    // Duplicate check by client_reference
    if (ref && ref.length >= 5 && !SKIP_REFS.has(ref.toLowerCase())) {
      const { data: existingByCR } = await supabase
        .from('jobs')
        .select('id, job_number')
        .eq('client_reference', ref)
        .eq('client_id', clientId)
        .limit(1)
      if (existingByCR?.length > 0) {
        console.log(`  [SKIP] Duplicate by client_reference: ${ref}`)
        return { id: existingByCR[0].id, job_number: existingByCR[0].job_number, duplicate: true }
      }
    }

    // Look up or create end_customer from docx customer name
    let endCustomerId = null
    const endCustomerName = d.customerName ?? null
    if (endCustomerName && clientId) {
      const { data: ec } = await supabase.from('end_customers').select('id')
        .ilike('name', `%${endCustomerName.split(' ')[0]}%`).eq('client_id', clientId).limit(1).single()
      endCustomerId = ec?.id ?? null
    }

    const { data: newJob, error } = await supabase.from('jobs').insert({
      job_number: jobNumber,
      job_type: jobType,
      order_types: orderTypes,
      status: 'new',
      client_id: clientId,
      end_customer_id: endCustomerId,
      client_reference: ref,
      contact_name: contactName,
      contact_phone: contactPhone,
      scheduled_date: scheduledDate,
      scheduled_time: scheduledTime,
      serial_number: machineSerial,
      machine_accessories: machineAccessories,
      address_to: addressTo,
      address_from: addressFrom,
      stair_walker: stairWalker,
      stair_walker_comment: stairWalkerComment,
      parking: parking,
      parking_comment: parkingComment,
      install_idca: installIdca,
      pickup_model: pickupModel,
      pickup_serial: pickupSerial,
      pickup_accessories: pickupAccessories,
      pickup_disposition: pickupDisposition,
      special_instructions: specialInstructions,
      machine_model: machineModel,
      has_aod: false,
      booking_form_url: bookingFormUrl,
      notes: `Auto-created from email — review and update fields as needed.\nSubject: ${subject}${endCustomerName ? '\nCustomer: ' + endCustomerName : ''}`,
    }).select('id, job_number').single()

    if (error) throw error

    // Auto-attach to open billing cycle
    if (newJob?.id && clientId) {
      const { data: openCycle } = await supabase
        .from('billing_cycles')
        .select('id')
        .eq('client_id', clientId)
        .eq('status', 'open')
        .order('period_start', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (openCycle?.id) {
        await supabase.from('jobs').update({ billing_cycle_id: openCycle.id }).eq('id', newJob.id)
        console.log(`  📎 Auto-attached to billing cycle ${openCycle.id}`)
      }
    }

    return { ...newJob, duplicate: false }
  } catch (e) {
    console.error('  ❌ Create error:', e.message)
    return null
  }
}

async function createAxusJob(axusData, pdfFilename, pdfBuffer, ediBuffer, ediFilename) {
  const clientRef = `AXUS-${axusData.axusJobNumber}`

  // Dedup check
  const { data: existing } = await supabase.from('jobs')
    .select('id, job_number').eq('client_reference', clientRef).maybeSingle()
  if (existing) return { ...existing, duplicate: true }

  const { data: axusClient } = await supabase.from('clients')
    .select('id').ilike('name', '%axus%').limit(1).single()
  const axusClientId = axusClient?.id ?? null

  // Look up or create end_customer
  let endCustomerId = null
  if (axusClientId && axusData.shipToName) {
    const firstName = axusData.shipToName.split(' ')[0]
    const { data: ec } = await supabase.from('end_customers')
      .select('id').eq('client_id', axusClientId).ilike('name', `%${firstName}%`).limit(1).single()
    if (ec?.id) {
      endCustomerId = ec.id
    } else {
      const { data: newEc } = await supabase.from('end_customers').insert({
        name: axusData.shipToName, client_id: axusClientId,
        contact_name: axusData.shipToAttn || null, contact_phone: axusData.shipToPhone || null,
        address: axusData.shipToAddress || null,
      }).select('id').single()
      endCustomerId = newEc?.id ?? null
    }
  }

  const jobNumber = String(axusData.axusJobNumber)

  // Upload PDFs
  const jobPdfUrl = pdfBuffer ? await uploadToSupabase('axus-jobs', pdfFilename, pdfBuffer, 'application/pdf') : null
  const labelUrl = ediBuffer ? await uploadToSupabase('axus-labels', ediFilename, ediBuffer, 'application/pdf') : null

  // Build notes
  const lineItemsSummary = axusData.lineItems.map(li => `${li.description} (${li.code}) x${li.qty}`).join(', ')
  const fullNotes = [
    axusData.fault || null,
    lineItemsSummary ? `Items: ${lineItemsSummary}` : null,
    labelUrl ? `EDI Label: ${labelUrl}` : null,
  ].filter(Boolean).join('\n')

  const { data: newJob, error } = await supabase.from('jobs').insert({
    job_number: jobNumber, job_type: 'toner', order_types: ['toner'],
    status: "dispatched", client_id: axusClientId, end_customer_id: endCustomerId,
    contact_name: axusData.shipToAttn || null, contact_phone: axusData.shipToPhone || null,
    scheduled_date: axusData.dateDue, address_to: axusData.shipToAddress || null,
    machine_model: axusData.machineModel || null, serial_number: axusData.serialNumber || null,
    notes: fullNotes || null, client_reference: clientRef, has_aod: false,
    booking_form_url: jobPdfUrl,
  }).select('id, job_number').single()

  if (error) throw error

  // Auto-attach to open billing cycle
  if (newJob?.id && axusClientId) {
    const { data: openCycle } = await supabase
      .from('billing_cycles')
      .select('id')
      .eq('client_id', axusClientId)
      .eq('status', 'open')
      .order('period_start', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (openCycle?.id) {
      await supabase.from('jobs').update({ billing_cycle_id: openCycle.id }).eq('id', newJob.id)
      console.log(`  📎 Auto-attached to billing cycle ${openCycle.id}`)
    }
  }

  return { ...newJob, axusData, labelUrl, duplicate: false }
}

async function run() {
  console.log('📬 Connecting to IMAP:', IMAP_HOST)
  const client = new ImapFlow({
    host: IMAP_HOST, port: IMAP_PORT, secure: true,
    auth: { user: IMAP_USER, pass: IMAP_PASS },
    logger: false,
  })

  await client.connect()
  await client.mailboxOpen('INBOX')

  const msgs = []
  for await (const msg of client.fetch('1:*', { envelope: true, uid: true, bodyStructure: true })) {
    msgs.push(msg)
  }

  // Filter: UNSEEN normally; or all-since-date when RESCAN_SINCE env is set
  const rescanSince = process.env.RESCAN_SINCE
  const unread = []
  if (rescanSince) {
    const sinceDate = new Date(rescanSince)
    console.log(`🔄 RESCAN mode: all emails since ${rescanSince}`)
    for await (const msg of client.fetch('1:*', { flags: true, uid: true, envelope: true })) {
      const msgDate = msg.envelope?.date ? new Date(msg.envelope.date) : null
      if (msgDate && msgDate >= sinceDate) unread.push(msg)
    }
  } else {
    for await (const msg of client.fetch('1:*', { flags: true, uid: true, envelope: true })) {
      if (!msg.flags.has('\\Seen')) unread.push(msg)
    }
  }

  console.log(`📨 ${unread.length} emails to process`)
  if (unread.length === 0) { await client.logout(); return }

  const uidsToMark = []

  for (const msg of unread) {
    const uid = msg.uid
    let body = ''
    let subject = msg.envelope?.subject ?? ''
    let from = msg.envelope?.from?.[0]?.address ?? ''
    let fromName = msg.envelope?.from?.[0]?.name ?? ''
    let attachments = []

    // Fetch full message
    try {
      for await (const full of client.fetch(String(uid), { source: true }, { uid: true })) {
        const parsed = await simpleParser(full.source)
        body = parsed.text ?? (typeof parsed.html === 'string' ? parsed.html.replace(/<[^>]+>/g, ' ') : '') ?? ''
        subject = parsed.subject ?? subject
        from = parsed.from?.value?.[0]?.address ?? from
        fromName = parsed.from?.value?.[0]?.name ?? fromName
        attachments = (parsed.attachments ?? []).map(a => ({
          filename: a.filename ?? 'attachment',
          contentType: a.contentType ?? '',
          content: a.content,
        }))
      }
    } catch (e) {
      console.error('  Parse error:', e.message)
    }

    console.log(`\n📧 From: ${fromName} <${from}>`)
    console.log(`   Subject: ${subject}`)

    // ── Skip remittance / payment advice emails — not job requests ─────────────
    if (/remittance|payment advice|eft:/i.test(subject) || /^accountspayable@/i.test(from)) {
      console.log(`  ℹ️  Remittance/payment email — skipping`)
      uidsToMark.push(uid)
      continue
    }

    // ── Warehouse scan handling (Kyocera packing list PDFs) ────────────────────
    if (from.toLowerCase() === 'warehouse@honorremovals.com.au') {
      const whPdf = attachments.find(a => a.contentType === 'application/pdf')
      if (whPdf) {
        console.log(`  📦 Warehouse scan PDF: ${whPdf.filename}`)

        // Dedup: check if we already have a job with this PDF filename
        const { data: existingWh } = await supabase.from('jobs')
          .select('id, job_number')
          .ilike('install_pdf_url', `%${whPdf.filename}%`)
          .maybeSingle()
        if (existingWh) {
          console.log(`  ⚠️  Duplicate warehouse scan — already exists as ${existingWh.job_number}`)
          await sendTelegram(`⚠️ <b>Duplicate detected:</b> Warehouse scan #${existingWh.job_number} already exists — skipped`)
          uidsToMark.push(uid)
          continue
        }

        let packingData = null
        try {
          packingData = await parsePackingListFromPdf(whPdf.content)
          if (packingData) {
            console.log(`  📦 Parsed packing list: ${packingData.lineItems?.length || 0} items, PO: ${packingData.customerPO || 'N/A'}`)
          }
        } catch (e) {
          console.error(`  ⚠️  Warehouse PDF parse error: ${e.message}`)
        }

        // Upload PDF to storage
        let pdfUrl = null
        try {
          const storagePath = `runup-pdfs/warehouse/${Date.now()}_${whPdf.filename}`
          const { error: upErr } = await supabase.storage
            .from('job-documents')
            .upload(storagePath, whPdf.content, { contentType: 'application/pdf', upsert: true })
          if (!upErr) {
            const { data: urlData } = supabase.storage.from('job-documents').getPublicUrl(storagePath)
            pdfUrl = urlData.publicUrl
            console.log(`  📎 Uploaded PDF: ${pdfUrl}`)
          } else {
            console.error(`  ⚠️  PDF upload error: ${upErr.message}`)
          }
        } catch (e) {
          console.error(`  ⚠️  PDF upload error: ${e.message}`)
        }

        if (packingData) {
          // Extract machine info from parsed packing list
          const machines = (packingData.lineItems || []).filter(i =>
            /ECOSYS|TASKalfa|LASER.*PRINT|COLOUR.*DIGITAL/i.test(i.description)
          )
          const machineModel = machines.map(i => {
            const m = i.description.match(/(ECOSYS\s+\S+|TASKalfa\s+\S+)/i)
            return m ? m[1] : i.description
          }).join(' + ') || null

          const serialNumber = (packingData.lineItems || [])
            .flatMap(i => i.serialNumbers || []).filter(Boolean)[0] || null

          const customerPO = packingData.customerPO || null
          const connote = packingData.connote || null
          const shipTo = packingData.shipTo || null

          const jobNumber = customerPO ? `RUNUP-WH-${customerPO}` : `RUNUP-WH-${Date.now()}`

          // Dedup: check job_number or po_number before insert
          const { data: existingByJobNum } = await supabase.from('jobs')
            .select('id, job_number').eq('job_number', jobNumber).maybeSingle()
          if (existingByJobNum) {
            console.log(`  ⚠️  Duplicate warehouse run-up — already exists as ${existingByJobNum.job_number}`)
            await sendTelegram(`⚠️ <b>Duplicate detected:</b> Warehouse run-up #${existingByJobNum.job_number} already exists — skipped`)
            uidsToMark.push(uid)
            continue
          }
          if (customerPO) {
            const { data: existingByPO } = await supabase.from('jobs')
              .select('id, job_number').eq('po_number', customerPO).eq('job_type', 'runup').maybeSingle()
            if (existingByPO) {
              console.log(`  ⚠️  Duplicate warehouse run-up by PO — already exists as ${existingByPO.job_number}`)
              await sendTelegram(`⚠️ <b>Duplicate detected:</b> Warehouse run-up #${existingByPO.job_number} (PO: ${customerPO}) already exists — skipped`)
              uidsToMark.push(uid)
              continue
            }
          }

          const noteLines = [
            'Warehouse scan — run-up job',
            `Shipment ID: ${packingData.shipmentId || 'N/A'}`,
            `Customer PO: ${customerPO || 'N/A'}`,
            `Ship Date: ${packingData.shipDate || 'N/A'}`,
            `Connote: ${connote || 'N/A'}`,
            shipTo ? `Ship To: ${shipTo}` : null,
          ].filter(Boolean).join('\n')

          const { data: newJob, error: jobErr } = await supabase.from('jobs').insert({
            job_number: jobNumber,
            job_type: 'runup',
            status: 'new',
            client_id: 'e35458d3-eef4-41cc-8be7-e9d331a657d3', // EFEX
            machine_model: machineModel,
            serial_number: serialNumber,
            po_number: customerPO,
            tracking_number: connote,
            address_to: shipTo,
            install_pdf_url: pdfUrl,
            notes: noteLines,
            special_instructions: JSON.stringify(packingData),
          }).select('id, job_number').single()

          if (jobErr) {
            console.error(`  ❌ Warehouse job create error: ${jobErr.message}`)
          } else {
            console.log(`  ✅ Created warehouse run-up job ${newJob.job_number}`)
            await sendTelegram(
              `🆕 <b>New Warehouse Run-Up — ${newJob.job_number}</b>\n` +
              (machineModel ? `🖨 Machine: ${machineModel}\n` : '') +
              (serialNumber ? `🔢 Serial: ${serialNumber}\n` : '') +
              (shipTo ? `📍 Ship To: ${shipTo}\n` : '') +
              (connote ? `📦 Connote: ${connote}\n` : '') +
              `🔗 https://crm.honorremovals.com.au/jobs`
            )
          }
        } else {
          // Could not parse — create runup_pending job for manual review
          const jobNumber = `RUNUP-WH-${Date.now()}`
          const { data: newJob, error: jobErr } = await supabase.from('jobs').insert({
            job_number: jobNumber,
            job_type: 'runup',
            status: 'runup_pending',
            client_id: 'e35458d3-eef4-41cc-8be7-e9d331a657d3', // EFEX
            install_pdf_url: pdfUrl,
            notes: 'Warehouse scan — manual review required',
          }).select('id, job_number').single()

          if (jobErr) {
            console.error(`  ❌ Warehouse job create error: ${jobErr.message}`)
          } else {
            console.log(`  ✅ Created warehouse job ${newJob.job_number} (pending_review)`)
            await sendTelegram(
              `🆕 <b>New Warehouse Scan — ${newJob.job_number}</b>\n` +
              `⚠️ Could not parse PDF — manual review required\n` +
              `🔗 https://crm.honorremovals.com.au/jobs`
            )
          }
        }

        uidsToMark.push(uid)
        continue
      }
      // Warehouse email but no PDF — skip
      console.log(`  ℹ️  Warehouse email without PDF — skipping`)
      uidsToMark.push(uid)
      continue
    }

    // ── Axus email handling ────────────────────────────────────────────────────
    const isAxusEmail = from.toLowerCase() === 'support@axusgroup.com.au'
    const isThreadReply = /^(re:|fw:|fwd:)/i.test(subject.trim())

    if (isAxusEmail && !isThreadReply) {
      const axusPdf = attachments.find(a =>
        a.filename.toLowerCase().startsWith('job nocomment') &&
        a.filename.toLowerCase().endsWith('.pdf')
      )
      if (axusPdf) {
        console.log(`  📄 Axus job PDF: ${axusPdf.filename}`)
        try {
          const axusData = await parseAxusJobPdf(axusPdf.content, subject)
          console.log(`  Axus Job#: ${axusData.axusJobNumber} | Type: ${axusData.jobType} | Ship To: ${axusData.shipToName}`)

          const ediPdf = attachments.find(a =>
            a.filename.toLowerCase().startsWith('edi labels') && a.contentType === 'application/pdf'
          )
          const result = await createAxusJob(
            axusData, axusPdf.filename, axusPdf.content,
            ediPdf?.content ?? null, ediPdf?.filename ?? null
          )

          if (result.duplicate) {
            console.log(`  ⚠️  Duplicate — already exists as ${result.job_number}`)
            await sendTelegram(`⚠️ <b>Duplicate detected:</b> AXUS Job #${result.job_number} already exists — skipped`)
          } else {
            console.log(`  ✅ Created AXUS job ${result.job_number}`)
            const lineItemsMsg = axusData.lineItems.map(li => `${li.description} x${li.qty}`).join(', ')
            await sendTelegram(
              `🆕 <b>New AXUS Job — ${result.job_number}</b>\n` +
              `📋 Type: ${axusData.jobType.charAt(0).toUpperCase() + axusData.jobType.slice(1)}\n` +
              `👤 Customer: ${axusData.shipToName}\n` +
              `📍 Deliver To: ${axusData.shipToAddress}\n` +
              `🔧 Machine: ${axusData.machineModel} | S/N: ${axusData.serialNumber}\n` +
              `📦 Items: ${lineItemsMsg || 'See job card'}\n` +
              (axusData.dateDue ? `📅 Due: ${axusData.dateDue}\n` : '') +
              `🔗 https://crm.honorremovals.com.au/jobs`
            )
          }
        } catch (e) {
          console.error(`  ❌ Axus PDF parse/create error: ${e.message}`)
        }
        uidsToMark.push(uid)
        continue
      }
      // Axus email but no Job NoComment PDF found — mark as read, skip
      console.log(`  ℹ️  Axus email without Job NoComment PDF — skipped`)
      uidsToMark.push(uid)
      continue
    }

    if (isAxusEmail && isThreadReply) {
      console.log(`  ℹ️  Axus thread reply — logged only`)
      uidsToMark.push(uid)
      continue
    }

    // ── Run-up (OK To Install) email handling ──────────────────────────────────
    if (isRunupJobRequest(subject, body, from)) {
      console.log(`  🔧 Run-up job email detected`)
      const runup = parseRunupEmail(subject, body, attachments)

      // Dedup check by job_number
      const { data: existingRunup } = await supabase.from('jobs')
        .select('id, job_number').eq('job_number', runup.jobNumber).maybeSingle()
      if (existingRunup) {
        console.log(`  ⚠️  Duplicate run-up — already exists as ${existingRunup.job_number}`)
        await sendTelegram(`⚠️ <b>Duplicate detected:</b> Run-Up Job #${existingRunup.job_number} already exists — skipped`)
      } else {
        // Parse PDF attachment if present (Kyocera packing list)
        const pdfAttach = attachments.find(a => a.contentType === 'application/pdf')
        let pdfUrl = null
        let packingListData = null
        let machineModel = null
        let serialNumber = null
        let poNumber = null
        let connote = null
        let accessories = null

        if (pdfAttach) {
          console.log(`  📄 PDF found: ${pdfAttach.filename} — parsing packing list...`)
          try {
            packingListData = await parsePackingListFromPdf(pdfAttach.content)
            if (packingListData) {
              // Extract primary machine model
              const machines = packingListData.lineItems.filter(i =>
                /ECOSYS|TASKalfa|LASER.*PRINT|COLOUR.*DIGITAL/i.test(i.description)
              )
              machineModel = machines.map(i => {
                const m = i.description.match(/(ECOSYS\s+\S+|TASKalfa\s+\S+)/i)
                return m ? m[1] : i.description
              }).join(' + ') || null

              serialNumber = packingListData.lineItems
                .flatMap(i => i.serialNumbers).filter(Boolean)[0] || null

              poNumber = packingListData.customerPO || null
              connote = packingListData.connote || null

              accessories = packingListData.lineItems
                .filter(i => !/ECOSYS|TASKalfa|LASER.*PRINT|COLOUR.*DIGITAL/i.test(i.description))
                .map(i => `${i.shippedQty || i.orderedQty}x ${i.description}`)
                .join(', ') || null

              console.log(`  📦 Parsed: ${packingListData.lineItems.length} line items, machine: ${machineModel}`)
            }
          } catch (e) {
            console.error(`  ⚠️  PDF parse error: ${e.message}`)
          }

          // Upload PDF to storage
          try {
            const storagePath = `runup-pdfs/${runup.jobNumber}/${pdfAttach.filename}`
            const { error: upErr } = await supabase.storage
              .from('job-documents')
              .upload(storagePath, pdfAttach.content, { contentType: 'application/pdf', upsert: true })
            if (!upErr) {
              const { data: urlData } = supabase.storage.from('job-documents').getPublicUrl(storagePath)
              pdfUrl = urlData.publicUrl
              console.log(`  📎 Uploaded PDF: ${pdfUrl}`)
            } else {
              console.error(`  ⚠️  PDF upload error: ${upErr.message}`)
            }
          } catch (e) {
            console.error(`  ⚠️  PDF upload error: ${e.message}`)
          }
        }

        // Build rich notes
        const noteLines = [`Run-up job — OK To Install`, `Subject: ${subject}`]
        if (packingListData) {
          noteLines.push('', `Shipment ID: ${packingListData.shipmentId || 'N/A'}`)
          noteLines.push(`Customer PO: ${packingListData.customerPO || 'N/A'}`)
          noteLines.push(`Ship Date: ${packingListData.shipDate || 'N/A'}`)
          noteLines.push(`Connote: ${packingListData.connote || 'N/A'}`)
          if (packingListData.shipTo) noteLines.push('', `Ship To: ${packingListData.shipTo}`)
        }

        const { data: newRunup, error: runupErr } = await supabase.from('jobs').insert({
          job_number: runup.jobNumber,
          job_type: 'runup',
          status: 'new',
          client_id: 'e35458d3-eef4-41cc-8be7-e9d331a657d3', // EFEX
          contact_name: runup.customerName,
          address_to: runup.city || null,
          notes: noteLines.join('\n'),
          machine_model: machineModel,
          serial_number: serialNumber,
          po_number: poNumber,
          tracking_number: connote,
          machine_accessories: accessories,
          install_pdf_url: pdfUrl,
          special_instructions: packingListData ? JSON.stringify(packingListData) : null,
        }).select('id, job_number').single()

        if (runupErr) {
          console.error(`  ❌ Run-up create error: ${runupErr.message}`)
        } else {
          console.log(`  ✅ Created run-up job ${newRunup.job_number}`)
          const machineInfo = machineModel ? `\n🖨 Machine: ${machineModel}` : ''
          const serialInfo = serialNumber ? `\n🔢 Serial: ${serialNumber}` : ''
          const itemCount = packingListData ? `\n📦 Items: ${packingListData.lineItems.length}` : ''
          await sendTelegram(
            `🆕 <b>New Run-Up Job — ${newRunup.job_number}</b>\n` +
            `👤 Customer: ${runup.customerName || 'Unknown'}\n` +
            `📍 City: ${runup.city || 'Unknown'}\n` +
            (runup.quoteNumber ? `📎 Quote: ${runup.quoteNumber}\n` : '') +
            machineInfo + serialInfo + itemCount +
            `\n🔗 https://crm.honorremovals.com.au/jobs`
          )
        }
      }
      uidsToMark.push(uid)
      continue
    }

    // ── Mitronics email handling ───────────────────────────────────────────────
    if (isMitronicsJobRequest(subject, body, from)) {
      console.log(`  🆕 Mitronics job request detected`)
      const result = await createMitronicsJob(body, subject, from, fromName)
      if (result && !result.duplicate) {
        console.log(`  ✅ Created Mitronics job ${result.job_number} (pending_review)`)
        await sendTelegram(
          `🆕 <b>New Mitronics Job — ${result.job_number}</b>\n` +
          `From: ${fromName} <${from}>\nSubject: ${subject}\n\n` +
          `⚠️ Status: pending_review — please fill in fields\n` +
          `🔗 https://crm.honorremovals.com.au/jobs`
        )
      } else if (result?.duplicate) {
        console.log(`  ⚠️  Duplicate skipped`)
        await sendTelegram(`⚠️ <b>Duplicate detected:</b> Mitronics Job #${result.job_number} already exists — skipped`)
      }
      uidsToMark.push(uid)
      continue
    }

    // ── EFEX docx/pdf job request form ──────────────────────────────────────────
    const docxAttach = attachments.find(a =>
      a.filename.toLowerCase().endsWith('.docx') ||
      a.contentType.includes('wordprocessingml') ||
      a.contentType.includes('msword')
    )
    // Also look for a PDF booking form (not AOD — exclude files with 'aod' or 'acknowledgment' in name)
    const efexPdfAttach = attachments.find(a =>
      a.contentType === 'application/pdf' &&
      !a.filename.toLowerCase().includes('aod') &&
      !a.filename.toLowerCase().includes('acknowledgment') &&
      !a.filename.toLowerCase().startsWith('job nocomment') &&
      !a.filename.toLowerCase().startsWith('edi label')
    )
    let docxFields = null
    if (docxAttach) {
      console.log(`  📄 DOCX found: ${docxAttach.filename} — parsing...`)
      const docxData = await extractDocxData(docxAttach.content)
      if (docxData.raw) {
        docxFields = parseEfexForm(docxData, subject)
        console.log(`  📄 Parsed: types=${JSON.stringify(docxFields.orderTypes)} customer="${docxFields.customerName}" model="${docxFields.machineModel}" serial="${docxFields.machineSerial}" addr="${docxFields.address?.slice(0,40)}")`)
      }
    } else if (efexPdfAttach && isEfexJobRequest(subject, body, from, false)) {
      // EFEX now sometimes sends PDF instead of DOCX — parse it the same way
      console.log(`  📄 EFEX PDF booking form found: ${efexPdfAttach.filename} — parsing...`)
      const pdfData = await extractPdfData(efexPdfAttach.content)
      if (pdfData.raw) {
        docxFields = parseEfexForm(pdfData, subject)
        console.log(`  📄 PDF Parsed: types=${JSON.stringify(docxFields.orderTypes)} customer="${docxFields.customerName}" model="${docxFields.machineModel}" serial="${docxFields.machineSerial}" addr="${docxFields.address?.slice(0,40)}")`)
      }
    }

    // Detect AOD PDF
    const aodAttach = attachments.find(a =>
      a.contentType === 'application/pdf' &&
      (a.filename.toLowerCase().includes('aod') || a.filename.toLowerCase().includes('acknowledgment'))
    )

    if (aodAttach) {
      console.log(`  📎 AOD PDF: ${aodAttach.filename}`)
      if (isEfexJobRequest(subject, body, from, !!(docxAttach || efexPdfAttach)) || docxFields) {
        console.log(`  🆕 Also a job request — creating job + saving AOD PDF`)
        // Upload EFEX booking form (DOCX or PDF) before creating job
        let efexBookingFormUrl = null
        if (docxAttach) {
          efexBookingFormUrl = await uploadToSupabase('efex-booking-forms', docxAttach.filename, docxAttach.content, docxAttach.contentType || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
          if (efexBookingFormUrl) console.log(`  📎 EFEX booking form (DOCX) uploaded`)
        } else if (efexPdfAttach) {
          efexBookingFormUrl = await uploadToSupabase('efex-booking-forms', efexPdfAttach.filename, efexPdfAttach.content, 'application/pdf')
          if (efexBookingFormUrl) console.log(`  📎 EFEX booking form (PDF) uploaded`)
        }
        const jobResult = await createJobFromEmail(body, subject, docxFields, efexBookingFormUrl)
        // Upload the AOD PDF and attach to the job
        if (jobResult?.id) {
          const aodUrl = await uploadToSupabase('aod-documents/efex-aod', aodAttach.filename, aodAttach.content, 'application/pdf')
          if (aodUrl) {
            await supabase.from('jobs').update({ aod_pdf_url: aodUrl, has_aod: true }).eq('id', jobResult.id)
            console.log(`  ✅ AOD PDF saved to job ${jobResult.job_number}`)
          }
        }
      }
    }

    if (!aodAttach && (isEfexJobRequest(subject, body, from, !!(docxAttach || efexPdfAttach)) || docxFields)) {
      console.log(`  🆕 EFEX job request detected`)
      // Upload EFEX booking form (DOCX or PDF) before creating job
      let efexBookingFormUrl = null
      if (docxAttach) {
        efexBookingFormUrl = await uploadToSupabase('efex-booking-forms', docxAttach.filename, docxAttach.content, docxAttach.contentType || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
        if (efexBookingFormUrl) console.log(`  📎 EFEX booking form (DOCX) uploaded`)
      } else if (efexPdfAttach) {
        efexBookingFormUrl = await uploadToSupabase('efex-booking-forms', efexPdfAttach.filename, efexPdfAttach.content, 'application/pdf')
        if (efexBookingFormUrl) console.log(`  📎 EFEX booking form (PDF) uploaded`)
      }
      const result = await createJobFromEmail(body, subject, docxFields, efexBookingFormUrl)

      if (result && !result.duplicate) {
        console.log(`  ✅ Created: ${result.job_number}`)
        const ref = extractEfexReference(subject + ' ' + body)
        const orderTypes = detectOrderTypes(subject + ' ' + body)
        await sendTelegram(
          `🆕 <b>New EFEX Job — ${result.job_number}</b>\n` +
          `📋 Type: ${orderTypes.join(' + ') || 'Delivery'}\n` +
          (ref ? `📎 Ref: ${ref}\n` : '') +
          `From: ${fromName}\nSubject: ${subject}\n\n` +
          `⚠️ Auto-parsed — please review fields\n` +
          `🔗 https://crm.honorremovals.com.au/jobs`
        )
      } else if (result?.duplicate) {
        console.log(`  ⚠️  Duplicate skipped`)
        await sendTelegram(`⚠️ <b>Duplicate detected:</b> EFEX Job #${result.job_number} already exists — skipped`)
      }
    } else {
      console.log(`  ℹ️  Not a job request — logged only`)
    }

    uidsToMark.push(uid)
  }

  // Mark as read
  if (uidsToMark.length > 0 && !process.env.RESCAN_SINCE) {
    await client.messageFlagsAdd(uidsToMark.join(','), ['\\Seen'])
    console.log(`\n✅ Marked ${uidsToMark.length} emails as read`)
  }

  await client.logout()
  console.log('Done.')
}

run().catch(e => { console.error('Fatal:', e); process.exit(1) })
