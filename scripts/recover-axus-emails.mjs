#!/usr/bin/env node
// One-off: recover and process all Axus emails (read or unread) from IMAP
import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

import { PDFParse } from 'pdf-parse'

const envVars = readFileSync(new URL('../.env.local', import.meta.url).pathname, 'utf8')
  .split('\n').reduce((acc, line) => {
    const m = line.match(/^([^=]+)=(.*)$/)
    if (m) acc[m[1].trim()] = m[2].trim()
    return acc
  }, {})

const supabase = createClient(envVars.NEXT_PUBLIC_SUPABASE_URL, envVars.SUPABASE_SERVICE_ROLE_KEY)
const BOT_TOKEN = envVars.HONOR_BOT_TOKEN
const GROUP_CHAT_ID = envVars.HONOR_GROUP_CHAT_ID

async function sendTelegram(text) {
  if (!BOT_TOKEN || !GROUP_CHAT_ID) return
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: GROUP_CHAT_ID, text, parse_mode: 'HTML' }),
  }).catch(e => console.error('Telegram error:', e.message))
}

// ── Axus PDF parser ──────────────────────────────────────────────────────────

function axusParseDate(raw) {
  if (!raw) return null
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (!m) return null
  const day = m[1].padStart(2, '0'), month = m[2].padStart(2, '0')
  let year = m[3]
  if (year.length === 2) year = (parseInt(year) >= 50 ? '19' : '20') + year
  return `${year}-${month}-${day}`
}

function axusMapJobType(raw) {
  const lower = raw.toLowerCase()
  if (lower.includes('consumable') || lower.includes('toner') || lower.includes('supply')) return 'toner_ship'
  if (lower.includes('install')) return 'install'
  if (lower.includes('collect') || lower.includes('pickup') || lower.includes('pick-up')) return 'collection'
  return 'delivery'
}

// Parse Axus "Job NoComment v2" PDF — multi-column table flattened to text stream
// The PDF layout is NOT inline labels — it's a 2-column table with data interleaved.
async function parseAxusJobPdf(buffer, subjectJobNumber = null) {
  const parser = new PDFParse({ data: buffer })
  const result = await parser.getText()
  const text = result.text
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0)

  // Job number: use email subject number if known (most reliable), else find first 5-6 digit number
  const jobNumM = text.match(/\b(\d{5,6})\b/)
  const jobNumber = subjectJobNumber ?? jobNumM?.[1] ?? ''

  // Type: standalone type keyword
  const rawType = lines.find(l => /^(Consumable|Installation|Delivery|Service|Collection)$/i.test(l)) ?? ''
  const jobType = axusMapJobType(rawType)

  // Status
  const status = lines.find(l => /^(Booked|In Progress|Complete|Cancelled)$/i.test(l)) ?? 'Booked'

  // Priority
  const priorityM = text.match(/\b(Normal|High|Urgent|Low)\b/i)
  const priority = priorityM?.[1] ?? 'Normal'

  // Dates
  const dateDueLine = text.match(/Date Due:\s*\n?(\d{1,2}\/\d{1,2}\/\d{2,4})/i)
  const dateDue = axusParseDate(dateDueLine?.[1] ?? null)
  const dateOutLine = text.match(/Date Out:\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i)
  const dateOut = axusParseDate(dateOutLine?.[1] ?? null)

  // Customer/Ship-To code: alphanumeric code after "Tel: Fax:" lines
  const codeM = text.match(/Tel: Fax:.*?\n([A-Z0-9]{4,20})\s/s)
  const customerCode = codeM?.[1] ?? ''
  const shipToCode = customerCode

  // Company name block after code/phone
  const afterCode = codeM ? text.slice(text.indexOf(codeM[1])) : text
  const companyM = afterCode.match(/\n([A-Z][^\n]{5,80})\n[^\n]+?\n([A-Z][A-Z\s,]+\d{4})/)
  const customerName = companyM?.[1]?.trim() ?? ''
  const shipToName = customerName

  // Address
  const addrM = afterCode.match(/([^\n]{5,80})\n([A-Z][A-Z\s,]+(?:NSW|VIC|QLD|SA|WA|TAS|ACT|NT)\s*\d{4})/i)
  const customerAddress = addrM ? `${addrM[1].trim()}, ${addrM[2].trim()}` : ''
  const shipToAddress = customerAddress

  // Phone
  const phoneM = text.match(/0[2-9][\d\s]{8,12}/)
  const customerPhone = phoneM?.[0]?.trim() ?? ''
  const shipToPhone = customerPhone

  // Attn: after "Job#\n" — name appears twice, deduplicate
  const attnM = text.match(/Job#\s*\n([^\n]{2,80})/)
  const rawAttn = attnM?.[1]?.trim() ?? ''
  const attnWords = rawAttn.split(/\s+/)
  const half = Math.floor(attnWords.length / 2)
  const deduped = (half > 0 && attnWords.slice(0, half).join(' ') === attnWords.slice(half).join(' '))
    ? attnWords.slice(0, half).join(' ') : rawAttn
  const customerAttn = deduped
  const shipToAttn = deduped

  // Machine: "{serial}  Serial #:  {model}  {itemCode}  Item:"
  const machineM = text.match(/(\d{5,8})\s+Serial #:\s+([^\t]+?)\s+([A-Z0-9-]{4,20})\s+Item:/)
  const serialNumber = machineM?.[1] ?? ''
  const machineModel = machineM?.[2]?.trim() ?? ''
  const machineItemCode = machineM?.[3] ?? ''

  // Fault
  const faultM = text.match(/Fault:\s*([^\n]+)/)
  const fault = faultM?.[1]?.trim() ?? ''

  // Line items: "{num} {qty} ${price} ${total}  {CODE} {UNIT}  {description} {qty}"
  const lineItems = []
  const lineItemRe = /\d+\s+[\d.]+\s+\$[\d.]+\s+\$[\d.]+\s+([A-Z0-9-]{4,})\s+\w+\s+([^\t\n]+?)\s+[\d.]+\s*$/gm
  let m
  while ((m = lineItemRe.exec(text)) !== null) {
    lineItems.push({ code: m[1].trim(), description: m[2].trim(), qty: 1 })
  }
  if (lineItems.length === 0) {
    const fallbackRe = /([A-Z0-9]{6,})\s+(?:UNIT|EA|BOX|CTN|EACH)\s+([^\n]{4,80})/g
    while ((m = fallbackRe.exec(text)) !== null) {
      lineItems.push({ code: m[1].trim(), description: m[2].trim(), qty: 1 })
    }
  }

  return {
    axusJobNumber: jobNumber,
    jobType, status, dateDue, dateOut, priority,
    customerName, customerCode, customerAddress, customerPhone, customerAttn,
    shipToName, shipToCode, shipToAddress, shipToPhone, shipToAttn,
    machineItemCode, machineModel, serialNumber, fault, lineItems,
  }
}

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

async function createAxusJob(axusData, pdfFilename, pdfBuffer, ediBuffer, ediFilename) {
  const clientRef = `AXUS-${axusData.axusJobNumber}`

  const { data: existing } = await supabase.from('jobs')
    .select('id, job_number').eq('client_reference', clientRef).maybeSingle()
  if (existing) return { ...existing, duplicate: true }

  const { data: axusClient } = await supabase.from('clients')
    .select('id').ilike('name', '%axus%').limit(1).single()
  const axusClientId = axusClient?.id ?? null

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

  const year = new Date().getFullYear()
  const { data: maxJob } = await supabase.from('jobs').select('job_number')
    .ilike('job_number', `HRL-${year}-%`).order('job_number', { ascending: false }).limit(1).single()
  let seq = 1
  if (maxJob?.job_number) {
    const lastSeq = parseInt(maxJob.job_number.split('-')[2], 10)
    if (!isNaN(lastSeq)) seq = lastSeq + 1
  }
  const jobNumber = `HRL-${year}-${String(seq).padStart(4, '0')}`

  const jobPdfUrl = pdfBuffer ? await uploadToSupabase('axus-jobs', pdfFilename, pdfBuffer, 'application/pdf') : null
  const labelUrl = ediBuffer ? await uploadToSupabase('axus-labels', ediFilename, ediBuffer, 'application/pdf') : null

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
  return { ...newJob, duplicate: false }
}

async function run() {
  const client = new ImapFlow({
    host: envVars.IMAP_HOST, port: Number(envVars.IMAP_PORT ?? 993), secure: true,
    auth: { user: envVars.IMAP_USER, pass: envVars.IMAP_PASS }, logger: false,
  })

  await client.connect()
  const mb = await client.mailboxOpen('INBOX')
  console.log(`📬 INBOX: ${mb.exists} total messages`)

  // Search for ALL messages from Axus (read + unread)
  let axusUids
  try {
    axusUids = await client.search({ from: 'support@axusgroup.com.au' }, { uid: true })
  } catch {
    // Fallback: fetch all and filter by envelope
    axusUids = []
    for await (const msg of client.fetch('1:*', { uid: true, envelope: true })) {
      const fromAddr = msg.envelope?.from?.[0]?.address?.toLowerCase() ?? ''
      if (fromAddr === 'support@axusgroup.com.au') axusUids.push(msg.uid)
    }
  }

  console.log(`📨 Found ${axusUids.length} Axus emails`)
  if (axusUids.length === 0) { await client.logout(); return }

  let created = 0, skipped = 0, failed = 0

  for (const uid of axusUids) {
    let subject = '', attachments = []
    try {
      for await (const full of client.fetch(String(uid), { source: true }, { uid: true })) {
        const parsed = await simpleParser(full.source)
        subject = parsed.subject ?? ''
        attachments = (parsed.attachments ?? []).map(a => ({
          filename: a.filename ?? 'attachment',
          contentType: a.contentType ?? '',
          content: a.content,
        }))
      }
    } catch (e) {
      console.error(`  UID ${uid} parse error: ${e.message}`)
      failed++
      continue
    }

    const isThreadReply = /^(re:|fw:|fwd:)/i.test(subject.trim())
    console.log(`\n📧 UID ${uid}: ${subject.slice(0, 60)}`)

    if (isThreadReply) {
      console.log('  ↩️  Thread reply — skipped')
      skipped++
      continue
    }

    const axusPdf = attachments.find(a =>
      a.filename.toLowerCase().startsWith('job nocomment') &&
      a.filename.toLowerCase().endsWith('.pdf')
    )

    if (!axusPdf) {
      console.log('  ℹ️  No Job NoComment PDF — skipped')
      skipped++
      continue
    }

    try {
      // Extract job number from email subject as definitive source
      const subjectJobNumM = subject.match(/\[Axus_Group Job#(\d+)/)
      const subjectJobNum = subjectJobNumM?.[1] ?? null
      const axusData = await parseAxusJobPdf(axusPdf.content, subjectJobNum)
      console.log(`  Job#: ${axusData.axusJobNumber} | ${axusData.jobType} | ${axusData.shipToName}`)

      const ediPdf = attachments.find(a =>
        a.filename.toLowerCase().startsWith('edi labels') && a.contentType === 'application/pdf'
      )

      const result = await createAxusJob(
        axusData, axusPdf.filename, axusPdf.content,
        ediPdf?.content ?? null, ediPdf?.filename ?? null
      )

      if (result.duplicate) {
        console.log(`  ⚠️  Duplicate — ${result.job_number}`)
        skipped++
      } else {
        console.log(`  ✅ Created ${result.job_number}`)
        created++
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
        // Small delay to avoid Telegram rate limiting
        await new Promise(r => setTimeout(r, 500))
      }
    } catch (e) {
      console.error(`  ❌ Error: ${e.message}`)
      failed++
    }
  }

  await client.logout()
  console.log(`\n✅ Done — Created: ${created} | Skipped: ${skipped} | Failed: ${failed}`)
}

run().catch(e => { console.error('Fatal:', e.message); process.exit(1) })
