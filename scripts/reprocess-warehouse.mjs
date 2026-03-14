#!/usr/bin/env node
/**
 * Reprocess warehouse emails (UIDs 287 & 288) through the new warehouse handler.
 * These are already-read messages in INBOX from warehouse@honorremovals.com.au.
 */
import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { parsePackingListText } from '/home/linuxuser/honor-logistics/scripts/parse-runup-pdf.mjs'

// Load env
const envFile = '/home/linuxuser/honor-logistics/.env.local'
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

// PDF parser (same as poll-emails.mjs)
import { PDFParse } from 'pdf-parse'

async function parsePackingListFromPdf(pdfBuffer) {
  try {
    const parser = new PDFParse({})
    const result = await parser.loadPDF(pdfBuffer)
    const pages = []
    for (let i = 0; i < result.numPages; i++) {
      const page = await result.getPage(i + 1)
      const textContent = await page.getTextContent()
      const text = textContent.items.map(item => item.str).join(' ')
      pages.push(text)
    }
    const fullText = pages.join('\n')
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

async function processWarehouseEmail(client, seqNo) {
  console.log(`\n── Processing message seq#${seqNo} ──`)

  let body = '', subject = '', from = '', fromName = '', attachments = []

  for await (const full of client.fetch(String(seqNo), { source: true })) {
    const parsed = await simpleParser(full.source)
    body = parsed.text ?? ''
    subject = parsed.subject ?? ''
    from = parsed.from?.value?.[0]?.address ?? ''
    fromName = parsed.from?.value?.[0]?.name ?? ''
    attachments = (parsed.attachments ?? []).map(a => ({
      filename: a.filename ?? 'attachment',
      contentType: a.contentType ?? '',
      content: a.content,
    }))
  }

  console.log(`  From: ${fromName} <${from}>`)
  console.log(`  Subject: ${subject || '(none)'}`)
  console.log(`  Attachments: ${attachments.length}`)

  if (from.toLowerCase() !== 'warehouse@honorremovals.com.au') {
    console.log(`  ⚠️  Not from warehouse@ — skipping`)
    return null
  }

  const whPdf = attachments.find(a => a.contentType === 'application/pdf')
  if (!whPdf) {
    console.log(`  ⚠️  No PDF attachment — skipping`)
    return null
  }

  console.log(`  📦 PDF: ${whPdf.filename}`)

  // Dedup check
  const { data: existingWh } = await supabase.from('jobs')
    .select('id, job_number')
    .ilike('install_pdf_url', `%${whPdf.filename}%`)
    .maybeSingle()
  if (existingWh) {
    console.log(`  ⚠️  Duplicate — already exists as ${existingWh.job_number}`)
    return { job_number: existingWh.job_number, duplicate: true }
  }

  // Parse PDF
  let packingData = null
  try {
    packingData = await parsePackingListFromPdf(whPdf.content)
    if (packingData) {
      console.log(`  📦 Parsed: ${packingData.lineItems?.length || 0} items, PO: ${packingData.customerPO || 'N/A'}`)
    }
  } catch (e) {
    console.error(`  ⚠️  PDF parse error: ${e.message}`)
  }

  // Upload PDF
  let pdfUrl = null
  try {
    const storagePath = `runup-pdfs/warehouse/${Date.now()}_${whPdf.filename}`
    const { error: upErr } = await supabase.storage
      .from('job-documents')
      .upload(storagePath, whPdf.content, { contentType: 'application/pdf', upsert: true })
    if (!upErr) {
      const { data: urlData } = supabase.storage.from('job-documents').getPublicUrl(storagePath)
      pdfUrl = urlData.publicUrl
      console.log(`  📎 Uploaded: ${pdfUrl}`)
    } else {
      console.error(`  ⚠️  Upload error: ${upErr.message}`)
    }
  } catch (e) {
    console.error(`  ⚠️  Upload error: ${e.message}`)
  }

  if (packingData) {
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
      console.error(`  ❌ Job create error: ${jobErr.message}`)
      return null
    }

    console.log(`  ✅ Created warehouse run-up job ${newJob.job_number}`)
    await sendTelegram(
      `🆕 <b>New Warehouse Run-Up — ${newJob.job_number}</b>\n` +
      (machineModel ? `🖨 Machine: ${machineModel}\n` : '') +
      (serialNumber ? `🔢 Serial: ${serialNumber}\n` : '') +
      (shipTo ? `📍 Ship To: ${shipTo}\n` : '') +
      (connote ? `📦 Connote: ${connote}\n` : '') +
      `🔗 https://crm.honorremovals.com.au/jobs`
    )
    return { job_number: newJob.job_number, duplicate: false, parsed: true }
  } else {
    const jobNumber = `RUNUP-WH-${Date.now()}`
    const { data: newJob, error: jobErr } = await supabase.from('jobs').insert({
      job_number: jobNumber,
      job_type: 'runup',
      status: 'runup_pending',
      install_pdf_url: pdfUrl,
      notes: 'Warehouse scan — manual review required',
    }).select('id, job_number').single()

    if (jobErr) {
      console.error(`  ❌ Job create error: ${jobErr.message}`)
      return null
    }

    console.log(`  ✅ Created warehouse job ${newJob.job_number} (pending_review)`)
    await sendTelegram(
      `🆕 <b>New Warehouse Scan — ${newJob.job_number}</b>\n` +
      `⚠️ Could not parse PDF — manual review required\n` +
      `🔗 https://crm.honorremovals.com.au/jobs`
    )
    return { job_number: newJob.job_number, duplicate: false, parsed: false }
  }
}

async function run() {
  console.log('📬 Connecting to IMAP for warehouse reprocess...')
  const client = new ImapFlow({
    host: IMAP_HOST, port: IMAP_PORT, secure: true,
    auth: { user: IMAP_USER, pass: IMAP_PASS },
    logger: false,
  })

  await client.connect()
  await client.mailboxOpen('INBOX')

  const results = []
  for (const seqNo of [287, 288]) {
    try {
      const result = await processWarehouseEmail(client, seqNo)
      results.push({ seqNo, result })
    } catch (e) {
      console.error(`  ❌ Error processing seq#${seqNo}: ${e.message}`)
      results.push({ seqNo, error: e.message })
    }
  }

  await client.logout()

  console.log('\n══ Summary ══')
  for (const r of results) {
    if (r.error) {
      console.log(`  seq#${r.seqNo}: ERROR — ${r.error}`)
    } else if (r.result?.duplicate) {
      console.log(`  seq#${r.seqNo}: DUPLICATE — ${r.result.job_number}`)
    } else if (r.result) {
      console.log(`  seq#${r.seqNo}: CREATED — ${r.result.job_number} (parsed: ${r.result.parsed})`)
    } else {
      console.log(`  seq#${r.seqNo}: SKIPPED`)
    }
  }
}

run().catch(e => { console.error('Fatal:', e); process.exit(1) })
