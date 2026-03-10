#!/usr/bin/env node
// Run directly on VPS: node scripts/poll-emails.mjs
import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import mammoth from 'mammoth'
import { PDFParse } from 'pdf-parse'

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

  return {
    customerName: cleanVal(customerName?.slice(0, 120)),
    orderTypes,
    scheduledDate,
    contactName: cleanVal(contactName?.slice(0, 80)),
    contactPhone: cleanVal(contactPhone?.replace(/\s+/g, ' ').slice(0, 20)),
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
  if (lower.includes('collect') || lower.includes('pickup') || lower.includes('pick-up')) return 'collection'
  return 'delivery'
}

async function parseAxusJobPdf(buffer) {
  const parser = new PDFParse({ data: buffer })
  const result = await parser.getText()
  const text = result.text

  const jobNumber = axusExtract(text, 'Job#') ?? axusExtract(text, 'Job No') ?? ''
  const rawType = axusExtract(text, 'Type') ?? ''
  const jobType = axusMapJobType(rawType)
  const status = axusExtract(text, 'Status') ?? 'Booked'
  const dateDue = axusParseDate(axusExtract(text, 'Date Due'))
  const dateOut = axusParseDate(axusExtract(text, 'Date Out'))
  const priority = axusExtract(text, 'Priority') ?? 'Normal'

  const customerLine = axusExtract(text, 'Customer') ?? ''
  const customerName = customerLine.replace(/\(Code:[^)]+\)/i, '').trim()
  const customerCodeM = customerLine.match(/Code:\s*([^\s)]+)/i)
  const customerCode = customerCodeM?.[1] ?? ''

  const customerBlock = axusExtractBlock(text, 'Customer', 'Ship To')
  const customerAddress = axusBlockField(customerBlock, 'Address') ?? ''
  const customerPhone = axusBlockField(customerBlock, 'Tel') ?? axusBlockField(customerBlock, 'Phone') ?? ''
  const customerAttn = axusBlockField(customerBlock, 'Attn') ?? ''

  const shipToLine = axusExtract(text, 'Ship To') ?? ''
  const shipToName = shipToLine.replace(/\(Code:[^)]+\)/i, '').trim()
  const shipToCodeM = shipToLine.match(/Code:\s*([^\s)]+)/i)
  const shipToCode = shipToCodeM?.[1] ?? ''

  const shipToBlock = axusExtractBlock(text, 'Ship To', 'Machine')
  const shipToAddress = axusBlockField(shipToBlock, 'Address') ?? ''
  const shipToPhone = axusBlockField(shipToBlock, 'Tel') ?? axusBlockField(shipToBlock, 'Phone') ?? ''
  const shipToAttn = axusBlockField(shipToBlock, 'Attn') ?? ''

  const machineLine = axusExtract(text, 'Machine') ?? ''
  const machineParts = machineLine.split(/\s*\|\s*/)
  const machineModel = machineParts[0]?.trim() ?? ''
  const itemPart = machineParts.find(p => /Item:/i.test(p))
  const machineItemCode = itemPart?.replace(/Item:/i, '').trim() ?? ''
  const serialPart = machineParts.find(p => /Serial#?:/i.test(p))
  const serialNumber = serialPart?.replace(/Serial#?:/i, '').trim() ?? axusExtract(text, 'Serial#') ?? ''
  const fault = axusExtract(text, 'Fault') ?? ''

  const lineItems = []
  const lineItemRe = /([A-Z0-9-]{4,})\s*\|\s*([^|]+?)\s*\|\s*Qty[:\s]+(\d+)/gi
  let m
  while ((m = lineItemRe.exec(text)) !== null) {
    lineItems.push({ code: m[1].trim(), description: m[2].trim(), qty: parseInt(m[3], 10) })
  }

  return {
    axusJobNumber: jobNumber.split(/\s/)[0],
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
const TRIGGER_DOMAINS = ['efex.com.au'] // emails from these domains are always processed as EFEX job requests
const SPAM_INDICATORS = ['***SPAM***', 'unsubscribe', 'SEO report', '4K', 'channels', 'website design']

function isEfexJobRequest(subject, body, fromEmail) {
  // Skip known non-job senders
  const domain = (fromEmail || '').split('@')[1]?.toLowerCase() ?? ''
  if (SKIP_DOMAINS.some(d => domain.includes(d))) return false
  if (SPAM_INDICATORS.some(s => subject.includes(s))) return false

  // Domain-level trigger: any email from a TRIGGER_DOMAIN is always an EFEX job request
  if (TRIGGER_DOMAINS.some(d => domain === d || domain.endsWith('.' + d))) return true

  const combined = (subject + ' ' + body).toLowerCase()
  return (
    combined.includes('delivery') || combined.includes('install') ||
    combined.includes('pick-up') || combined.includes('collection') ||
    combined.includes('relocation') || combined.includes('booking') ||
    combined.includes('efex')
  ) && !combined.includes('acknowledgment') && !combined.includes('invoice')
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
    return { ...newJob, duplicate: false }
  } catch (e) {
    console.error('  ❌ Mitronics create error:', e.message)
    return null
  }
}

async function createJobFromEmail(body, subject, docx = null) {
  try {
    const { data: efexClient } = await supabase.from('clients').select('id').ilike('name', '%efex%').limit(1).single()
    const clientId = efexClient?.id ?? null

    const combined = subject + '\n' + body

    // Prefer docx fields over email body parsing
    const d = docx ?? {}
    const orderTypes = (d.orderTypes?.length > 0) ? d.orderTypes : detectOrderTypes(combined)
    const jobType = ORDER_TYPE_MAP[orderTypes[0]] ?? 'delivery'
    const ref = d.efexRef ?? extractEfexReference(combined)
    const contactName = d.contactName ?? extractField(combined, 'contact', 'best contact', 'contact person', 'attn')
    const contactPhone = d.contactPhone ?? extractField(combined, 'phone', 'mobile', 'tel', 'contact number')
    const scheduledDate = d.scheduledDate ?? extractDate(subject) ?? extractDate(combined)
    const scheduledTime = extractField(combined, 'time', 'delivery time', 'arrival time')
    const machineSerial = cleanVal(d.machineSerial ?? extractField(combined, 'serial', 's/n', 'serial number'))
    const machineAccessories = cleanVal(d.machineAccessories) ?? null
    const addressTo = d.address ?? extractField(combined, 'delivery address', 'address', 'site address')
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

    // Use MAX job_number to avoid collisions (count-based breaks on deletes)
    const year = new Date().getFullYear()
    const { data: lastJob } = await supabase.from('jobs')
      .select('job_number').ilike('job_number', `HRL-${year}-%`)
      .order('job_number', { ascending: false }).limit(1).single()
    const lastSeq = lastJob?.job_number ? parseInt(lastJob.job_number.split('-')[2] ?? '0') : 0
    const jobNumber = `HRL-${year}-${String(lastSeq + 1).padStart(4, '0')}`

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
      notes: `Auto-created from email — review and update fields as needed.\nSubject: ${subject}${endCustomerName ? '\nCustomer: ' + endCustomerName : ''}`,
    }).select('id, job_number').single()

    if (error) throw error
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

  // Generate job number
  const year = new Date().getFullYear()
  const { data: maxJob } = await supabase.from('jobs').select('job_number')
    .ilike('job_number', `HRL-${year}-%`).order('job_number', { ascending: false }).limit(1).single()
  let seq = 1
  if (maxJob?.job_number) {
    const lastSeq = parseInt(maxJob.job_number.split('-')[2], 10)
    if (!isNaN(lastSeq)) seq = lastSeq + 1
  }
  const jobNumber = `HRL-${year}-${String(seq).padStart(4, '0')}`

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
    job_number: jobNumber, job_type: axusData.jobType, order_types: [axusData.jobType],
    status: 'new', client_id: axusClientId, end_customer_id: endCustomerId,
    contact_name: axusData.shipToAttn || null, contact_phone: axusData.shipToPhone || null,
    scheduled_date: axusData.dateDue, address_to: axusData.shipToAddress || null,
    machine_model: axusData.machineModel || null, serial_number: axusData.serialNumber || null,
    notes: fullNotes || null, client_reference: clientRef, has_aod: false,
    booking_form_url: jobPdfUrl,
  }).select('id, job_number').single()

  if (error) throw error
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

  // Filter unread
  const unread = []
  for await (const msg of client.fetch('1:*', { flags: true, uid: true, envelope: true })) {
    if (!msg.flags.has('\\Seen')) unread.push(msg)
  }

  console.log(`📨 ${unread.length} unread emails`)
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
          const axusData = await parseAxusJobPdf(axusPdf.content)
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
      }
      uidsToMark.push(uid)
      continue
    }

    // ── EFEX docx job request form ─────────────────────────────────────────────
    const docxAttach = attachments.find(a =>
      a.filename.toLowerCase().endsWith('.docx') ||
      a.contentType.includes('wordprocessingml') ||
      a.contentType.includes('msword')
    )
    let docxFields = null
    if (docxAttach) {
      console.log(`  📄 DOCX found: ${docxAttach.filename} — parsing...`)
      const docxData = await extractDocxData(docxAttach.content)
      if (docxData.raw) {
        docxFields = parseEfexForm(docxData, subject)
        console.log(`  📄 Parsed: types=${JSON.stringify(docxFields.orderTypes)} customer="${docxFields.customerName}" model="${docxFields.machineModel}" serial="${docxFields.machineSerial}" addr="${docxFields.address?.slice(0,40)}")`)
      }
    }

    // Detect AOD PDF
    const aodAttach = attachments.find(a =>
      a.contentType === 'application/pdf' &&
      (a.filename.toLowerCase().includes('aod') || a.filename.toLowerCase().includes('acknowledgment'))
    )

    if (aodAttach) {
      console.log(`  📎 AOD PDF: ${aodAttach.filename}`)
      if (isEfexJobRequest(subject, body, from) || docxFields) {
        console.log(`  🆕 Also a job request — creating job`)
        await createJobFromEmail(body, subject, docxFields)
      }
    }

    if (!aodAttach && (isEfexJobRequest(subject, body, from) || docxFields)) {
      console.log(`  🆕 EFEX job request detected`)
      const result = await createJobFromEmail(body, subject, docxFields)

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
      }
    } else {
      console.log(`  ℹ️  Not a job request — logged only`)
    }

    uidsToMark.push(uid)
  }

  // Mark as read
  if (uidsToMark.length > 0) {
    await client.messageFlagsAdd(uidsToMark.join(','), ['\\Seen'])
    console.log(`\n✅ Marked ${uidsToMark.length} emails as read`)
  }

  await client.logout()
  console.log('Done.')
}

run().catch(e => { console.error('Fatal:', e); process.exit(1) })
