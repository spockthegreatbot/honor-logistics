#!/usr/bin/env node
/**
 * Backfill run-up jobs with parsed PDF data from IMAP emails.
 * 
 * 1. Fetches "OK To Install" emails from IMAP
 * 2. Extracts PDF attachments
 * 3. Parses packing list data using vision/text extraction
 * 4. Uploads PDFs to Supabase storage
 * 5. Updates job records with parsed data
 */

import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import { readFileSync } from 'fs'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { createClient } = require('@supabase/supabase-js')

// Load env
const envFile = new URL('../.env.local', import.meta.url).pathname
const env = readFileSync(envFile, 'utf8').split('\n').reduce((acc, line) => {
  const m = line.match(/^([^=]+)=(.*)$/)
  if (m) acc[m[1].trim()] = m[2].trim()
  return acc
}, {})

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

// Hardcoded PDF text (extracted via pdf tool) for the 3 known emails
// This avoids needing a working pdf-parse library for the text extraction
const KNOWN_PDFS = {
  256: {
    jobNumber: 'RUNUP-Q-29891',
    text: `Ship Date: 6/3/2026
Shipment ID: 81001061
Customer PO: SYD181643
Ship From: KYOCERA C/O YUSEN LOGISTICS, 1 Entolasia Close, Kemps Creek NSW 2178
Ship To: EFEX MORTDALE C/O HONOR REMOVALS, UNIT 2 / 53 LORRAINE STREET, MORTDALE NSW
Connote: 3074698692`,
    parsed: {
      shipDate: '6/3/2026',
      shipmentId: '81001061',
      customerPO: 'SYD181643',
      connote: '3074698692',
      shipFrom: 'KYOCERA C/O YUSEN LOGISTICS, 1 Entolasia Close, Kemps Creek NSW 2178',
      shipTo: 'EFEX MORTDALE C/O HONOR REMOVALS, UNIT 2 / 53 LORRAINE STREET, MORTDALE NSW',
      lineItems: [
        { itemCode: '1703SZOJUNO', description: 'AK-7110 ATTACHMENT KIT', orderedQty: 1, shippedQty: 1, serialNumbers: [] },
        { itemCode: '110C0Y3AU0', description: 'ECOSYS P4500x 45PPM A4 MONO LASER PRINT', orderedQty: 1, shippedQty: 1, serialNumbers: ['110C0Y3AU01J5910000'] },
        { itemCode: '110C2M3AU0', description: 'TASKalfa MZ7501ci 25PPM COLOUR DIGITAL M', orderedQty: 2, shippedQty: 2, serialNumbers: ['110C2M3AU01FW5801825', '110C2M3AU01FW5801826'] },
        { itemCode: '1203TC5AUY', description: 'DP-7160 DOCUMENT PROCESSOR', orderedQty: 2, shippedQty: 2, serialNumbers: [] },
        { itemCode: '1T0C2M0AU0', description: 'TK-8459K TONER KIT BLACK', orderedQty: 2, shippedQty: 2, serialNumbers: [] },
        { itemCode: '1T0C2MCAU0', description: 'TK-8459C TONER KIT CYAN', orderedQty: 2, shippedQty: 2, serialNumbers: [] },
        { itemCode: '1T0C2MBAU0', description: 'TK-8459M TONER KIT MAGENTA', orderedQty: 2, shippedQty: 2, serialNumbers: [] },
        { itemCode: '1T0C2MAAU0', description: 'TK-8459Y TONER KIT YELLOW', orderedQty: 2, shippedQty: 2, serialNumbers: [] },
        { itemCode: '1203V53NLV', description: 'PF-7150 PAPER FEEDER', orderedQty: 2, shippedQty: 2, serialNumbers: [] },
      ],
      primaryMachine: { model: 'TASKalfa MZ7501ci', description: 'TASKalfa MZ7501ci 25PPM COLOUR DIGITAL M' },
      secondaryMachine: { model: 'ECOSYS P4500x', description: 'ECOSYS P4500x 45PPM A4 MONO LASER PRINT' },
    },
  },
  257: {
    jobNumber: 'RUNUP-Q-30171',
    text: `Ship Date: 10/3/2026
Shipment ID: 81002519
Customer PO: SYD181771
Ship From: KYOCERA C/O YUSEN LOGISTICS, 1 Entolasia Close, Kemps Creek NSW 2178
Ship To: EFEX MORTDALE C/O HONOR REMOVALS, UNIT 2 / 53 LORRAINE STREET, MORTDALE NSW
Connote: 3074700395`,
    parsed: {
      shipDate: '10/3/2026',
      shipmentId: '81002519',
      customerPO: 'SYD181771',
      connote: '3074700395',
      shipFrom: 'KYOCERA C/O YUSEN LOGISTICS, 1 Entolasia Close, Kemps Creek NSW 2178',
      shipTo: 'EFEX MORTDALE C/O HONOR REMOVALS, UNIT 2 / 53 LORRAINE STREET, MORTDALE NSW',
      lineItems: [
        { itemCode: '1102Z33AU0', description: 'ECOSYS MA3500CIFX 35PPM A4 COLOUR LASER', orderedQty: 1, shippedQty: 1, serialNumbers: ['1102Z33AU0H7W6101092'] },
        { itemCode: '1203V00KL0', description: 'PF-5150 PAPER FEEDER', orderedQty: 1, shippedQty: 1, serialNumbers: [] },
      ],
      primaryMachine: { model: 'ECOSYS MA3500CIFX', description: 'ECOSYS MA3500CIFX 35PPM A4 COLOUR LASER' },
    },
  },
  258: {
    jobNumber: 'RUNUP-Q-29975',
    text: `Ship Date: 10/3/2026
Shipment ID: 81002520
Customer PO: SYD181770
Ship From: KYOCERA C/O YUSEN LOGISTICS, 1 Entolasia Close, Kemps Creek NSW 2178
Ship To: EFEX MORTDALE C/O HONOR REMOVALS, UNIT 2 / 53 LORRAINE STREET, MORTDALE NSW
Connote: 3074700395`,
    parsed: {
      shipDate: '10/3/2026',
      shipmentId: '81002520',
      customerPO: 'SYD181770',
      connote: '3074700395',
      shipFrom: 'KYOCERA C/O YUSEN LOGISTICS, 1 Entolasia Close, Kemps Creek NSW 2178',
      shipTo: 'EFEX MORTDALE C/O HONOR REMOVALS, UNIT 2 / 53 LORRAINE STREET, MORTDALE NSW',
      lineItems: [
        { itemCode: '1102Z33AU0', description: 'ECOSYS MA3500CIFX 35PPM A4 COLOUR LASER', orderedQty: 1, shippedQty: 1, serialNumbers: ['1102Z33AU0H7W6101098'] },
        { itemCode: '1203V00KL0', description: 'PF-5150 PAPER FEEDER', orderedQty: 1, shippedQty: 1, serialNumbers: [] },
      ],
      primaryMachine: { model: 'ECOSYS MA3500CIFX', description: 'ECOSYS MA3500CIFX 35PPM A4 COLOUR LASER' },
    },
  },
}

async function ensureBucket() {
  const { data: buckets } = await supabase.storage.listBuckets()
  const exists = buckets?.some(b => b.name === 'job-documents')
  if (!exists) {
    await supabase.storage.createBucket('job-documents', { public: true })
    console.log('Created job-documents bucket')
  }
}

async function run() {
  await ensureBucket()

  // Connect to IMAP and fetch the PDFs
  const client = new ImapFlow({
    host: env.IMAP_HOST, port: Number(env.IMAP_PORT ?? 993), secure: true,
    auth: { user: env.IMAP_USER, pass: env.IMAP_PASS },
    logger: false,
  })

  await client.connect()
  await client.mailboxOpen('INBOX')

  // Find OK To Install emails
  const emails = []
  for await (const msg of client.fetch('1:*', { envelope: true, uid: true })) {
    if (/ok to install/i.test(msg.envelope?.subject ?? '')) {
      emails.push({ uid: msg.uid, subject: msg.envelope.subject })
    }
  }

  console.log(`Found ${emails.length} "OK To Install" emails\n`)

  for (const email of emails) {
    const known = KNOWN_PDFS[email.uid]
    if (!known) {
      console.log(`UID ${email.uid}: No known mapping, skipping`)
      continue
    }

    console.log(`\n--- Processing UID ${email.uid}: ${known.jobNumber} ---`)

    // Fetch the full email to get the PDF attachment
    let pdfBuffer = null
    let pdfFilename = null
    for await (const full of client.fetch(String(email.uid), { source: true }, { uid: true })) {
      const parsed = await simpleParser(full.source)
      const pdfs = (parsed.attachments ?? []).filter(a => a.contentType === 'application/pdf')
      if (pdfs.length > 0) {
        pdfBuffer = pdfs[0].content
        pdfFilename = pdfs[0].filename
      }
    }

    if (!pdfBuffer) {
      console.log('  No PDF found, skipping')
      continue
    }

    console.log(`  PDF: ${pdfFilename} (${pdfBuffer.length} bytes)`)

    // Upload PDF to Supabase storage
    const storagePath = `runup-pdfs/${known.jobNumber}/${pdfFilename}`
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('job-documents')
      .upload(storagePath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      })

    if (uploadError) {
      console.error(`  Upload error: ${uploadError.message}`)
      continue
    }

    // Get public URL
    const { data: urlData } = supabase.storage.from('job-documents').getPublicUrl(storagePath)
    const pdfUrl = urlData.publicUrl
    console.log(`  Uploaded: ${pdfUrl}`)

    // Build the update payload using existing columns
    const { parsed } = known
    const primaryMachine = parsed.primaryMachine
    const allSerials = parsed.lineItems
      .flatMap(i => i.serialNumbers)
      .filter(Boolean)
    
    // Build accessories string (non-machine items)
    const accessories = parsed.lineItems
      .filter(i => !i.description.match(/ECOSYS|TASKalfa|LASER.*PRINT|COLOUR.*DIGITAL/i))
      .map(i => `${i.shippedQty}x ${i.description}`)
      .join(', ')

    // Build machine model string
    const machineModels = parsed.lineItems
      .filter(i => i.description.match(/ECOSYS|TASKalfa|LASER.*PRINT|COLOUR.*DIGITAL/i))
      .map(i => {
        const modelMatch = i.description.match(/(ECOSYS\s+\S+|TASKalfa\s+\S+)/i)
        return modelMatch ? modelMatch[1] : i.description
      })
      .join(' + ')

    // Store full parsed data as JSON in special_instructions
    const packingListData = {
      shipDate: parsed.shipDate,
      shipmentId: parsed.shipmentId,
      customerPO: parsed.customerPO,
      connote: parsed.connote,
      shipFrom: parsed.shipFrom,
      shipTo: parsed.shipTo,
      lineItems: parsed.lineItems,
      parsedAt: new Date().toISOString(),
    }

    // Build rich notes
    const noteLines = [
      `Run-up job — OK To Install`,
      `Subject: ${email.subject}`,
      ``,
      `Shipment ID: ${parsed.shipmentId}`,
      `Customer PO: ${parsed.customerPO}`,
      `Ship Date: ${parsed.shipDate}`,
      `Connote: ${parsed.connote}`,
      ``,
      `Ship To: ${parsed.shipTo}`,
    ]

    const update = {
      machine_model: machineModels || null,
      serial_number: allSerials[0] || null,
      po_number: parsed.customerPO || null,
      tracking_number: parsed.connote || null,
      machine_accessories: accessories || null,
      special_instructions: JSON.stringify(packingListData),
      install_pdf_url: pdfUrl,
      notes: noteLines.join('\n'),
    }

    console.log(`  Machine: ${update.machine_model}`)
    console.log(`  Serial: ${update.serial_number}`)
    console.log(`  PO: ${update.po_number}`)
    console.log(`  Connote: ${update.tracking_number}`)
    console.log(`  Accessories: ${update.machine_accessories}`)
    console.log(`  Line items: ${parsed.lineItems.length}`)

    // Update the job in Supabase
    const { error: updateError } = await supabase
      .from('jobs')
      .update(update)
      .eq('job_number', known.jobNumber)

    if (updateError) {
      console.error(`  Update error: ${updateError.message}`)
    } else {
      console.log(`  ✅ Updated ${known.jobNumber}`)
    }
  }

  await client.logout()
  console.log('\nDone!')
}

run().catch(e => { console.error('Fatal:', e); process.exit(1) })
