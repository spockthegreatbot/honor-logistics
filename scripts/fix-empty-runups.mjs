#!/usr/bin/env node
/**
 * Fix Empty Run-Up Jobs
 * 
 * Backfills run-up jobs that have install_pdf_url but no machine_model.
 * Uses manually extracted data from PDF analysis (these are scanned image PDFs
 * that pdf-parse cannot extract text from).
 * 
 * Run once: node scripts/fix-empty-runups.mjs
 * Dry run:  node scripts/fix-empty-runups.mjs --dry-run
 */

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
const DRY_RUN = process.argv.includes('--dry-run')

/**
 * Manually extracted PDF data (these are scanned images, not text PDFs).
 * Keyed by the PDF filename prefix from the storage path.
 */
const PDF_EXTRACTED_DATA = {
  // doc01114120260313150401 — Evolved Digital delivery docket (APEOS C3530 for Mandria Accounting)
  'doc01114120260313150401': {
    machine_model: 'APEOS C3530',
    serial_number: '050305-VE2',
    contact_name: 'Mandria Accounting Pty Ltd',
    address_to: 'HONOR REMOVALS & LOGISTICS, 2/53 Lorraine St, Mortdale NSW 2223',
    address_from: 'EVOLVED DIGITAL PTY LTD, 7A The Esplanade, Ashfield NSW 2131',
    po_number: null,
    tracking_number: null,
    machine_accessories: null,
    notes_append: 'Delivery Docket — Evolved Digital | Your Ref: 0000177 | Our Ref: 2683370 | Date: 12-MAR-26',
    special_instructions: JSON.stringify({
      documentType: 'delivery_docket',
      supplier: 'EVOLVED DIGITAL PTY LTD',
      customerName: 'Mandria Accounting Pty Ltd',
      model: 'APEOS C3530 35PPM A4 COLOUR PRINT/COPY/SCAN MFP',
      serial: '050305-VE2',
      yourRef: '0000177',
      ourRef: '2683370',
      date: '12-MAR-26',
      parsedAt: new Date().toISOString(),
    }),
  },
  // doc01114220260313150908 — Evolved Digital delivery docket (APEOS C3530 for Mandria Accounting, 2nd unit)
  'doc01114220260313150908': {
    machine_model: 'APEOS C3530',
    serial_number: '051388-VE2',
    contact_name: 'Mandria Accounting Pty Ltd',
    address_to: 'HONOR REMOVALS & LOGISTICS, 2/53 Lorraine St, Mortdale NSW 2223',
    address_from: 'EVOLVED DIGITAL PTY LTD, 7A The Esplanade, Ashfield NSW 2131',
    po_number: null,
    tracking_number: null,
    machine_accessories: '1x 550 SHEET FEEDER FOR A4830/AC5240/AC5240EX/APC5240/A6340/A6340EX/AP6340',
    notes_append: 'Delivery Docket — Evolved Digital | Your Ref: 0000176 | Our Ref: 2683251 | Date: 12-MAR-26',
    special_instructions: JSON.stringify({
      documentType: 'delivery_docket',
      supplier: 'EVOLVED DIGITAL PTY LTD',
      customerName: 'Mandria Accounting Pty Ltd',
      model: 'APEOS C3530 35PPM A4 COLOUR PRINT/COPY/SCAN MFP',
      serial: '051388-VE2',
      yourRef: '0000176',
      ourRef: '2683251',
      date: '12-MAR-26',
      accessories: '550 SHEET FEEDER FOR A4830/AC5240',
      parsedAt: new Date().toISOString(),
    }),
  },
  // doc01114420260313175541 — Mitronics Acceptance of Delivery (HP LaserJet E877Z for Ray White)
  'doc01114420260313175541': {
    machine_model: 'HP LASERJET MANAGED E877Z',
    serial_number: 'CNB2T8N2K2',
    contact_name: 'Ray White Real Estate - Jordan Springs',
    address_to: 'Ray White Real Estate - Penrith, 1/31-33 Henry Street, Penrith NSW 2750',
    address_from: 'Mitronics Corporation, 90-94 Hermitage Road, West Ryde NSW 2114',
    po_number: null,
    tracking_number: null,
    machine_accessories: null,
    notes_append: 'Acceptance of Delivery — Mitronics | Job# 1608623 | Order: 2016065-1 | Type: Relocation | Contact: Andre 0478 896 895 | Instructions: TRUCK STOP - PENRITH UPSTAIRS TO DOWNSTAIRS',
    special_instructions: JSON.stringify({
      documentType: 'acceptance_of_delivery',
      supplier: 'Mitronics Corporation',
      customerName: 'Ray White Real Estate - Jordan Springs',
      shipTo: 'Ray White Real Estate - Penrith, 1/31-33 Henry Street, Penrith NSW 2750',
      model: 'HP LASERJET MANAGED E877Z COLOR PRINTER',
      serial: 'CNB2T8N2K2',
      jobNumber: '1608623',
      orderNumber: '2016065-1',
      contact: 'Andre 0478 896 895',
      instructions: 'TRUCK STOP - PENRITH UPSTAIRS TO DOWNSTAIRS',
      parsedAt: new Date().toISOString(),
    }),
  },
  // doc01114520260313180143 — EFEX Acknowledgement of Delivery (Kyocera TASKalfa 5053ci for Attcall Group)
  'doc01114520260313180143': {
    machine_model: 'TASKalfa 5053ci',
    serial_number: 'RF90700585',
    contact_name: 'ATTCALL GROUP PTY LTD',
    address_to: '1589 Elizabeth Drive, Kemps Creek NSW 2178',
    address_from: null,
    po_number: null,
    tracking_number: null,
    machine_accessories: null,
    notes_append: 'EFEX Acknowledgement of Delivery | Kyocera TASKalfa 5053ci (Refurb) | Date: 13/03/2026',
    special_instructions: JSON.stringify({
      documentType: 'efex_aod',
      customerName: 'ATTCALL GROUP PTY LTD',
      model: 'Kyocera TASKalfa 5053ci (Refurb)',
      serial: 'RF90700585',
      location: '1589 Elizabeth Drive, Kemps Creek NSW 2178',
      date: '13/03/2026',
      parsedAt: new Date().toISOString(),
    }),
  },
  // doc01114620260313180535 — Meter Count List (KM_C360i for Watson - Mealy)
  'doc01114620260313180535': {
    machine_model: 'KM C360i',
    serial_number: 'AA2JA0101786',
    contact_name: 'Watson - Mealy',
    address_to: null,
    address_from: null,
    po_number: null,
    tracking_number: null,
    machine_accessories: null,
    notes_append: 'Meter Count List — KM_C360i | Serial: AA2JA0101786 | TC: 117046 | Date: 13/03/2026',
    special_instructions: JSON.stringify({
      documentType: 'meter_count',
      customerName: 'Watson - Mealy',
      model: 'KM_C360i',
      serial: 'AA2JA0101786',
      totalCounter: 117046,
      date: '13/03/2026',
      parsedAt: new Date().toISOString(),
    }),
  },
  // doc01114720260313180542 — Meter Count List (device at WOTSO Zetland)
  'doc01114720260313180542': {
    machine_model: null, // No model visible on document
    serial_number: 'AA2J04100743',
    contact_name: 'WOTSO Zetland',
    address_to: null,
    address_from: null,
    po_number: null,
    tracking_number: null,
    machine_accessories: null,
    notes_append: 'Meter Count List — Device: WOTSO Zetland | Serial: AA2J04100743 | TC: 376884 | Date: 13/03/2026',
    special_instructions: JSON.stringify({
      documentType: 'meter_count',
      customerName: 'WOTSO Zetland',
      serial: 'AA2J04100743',
      totalCounter: 376884,
      date: '13/03/2026',
      parsedAt: new Date().toISOString(),
    }),
  },
  // doc01114820260313180709 — Status Page (TASKalfa 4052ci + TASKalfa 2552ci)
  'doc01114820260313180709': {
    machine_model: 'TASKalfa 4052ci + TASKalfa 2552ci',
    serial_number: null, // Serial not clearly visible on status pages
    contact_name: null,
    address_to: null,
    address_from: null,
    po_number: null,
    tracking_number: null,
    machine_accessories: null,
    notes_append: 'Printer Status Pages — TASKalfa 4052ci + TASKalfa 2552ci | Date: 13/03/2026',
    special_instructions: JSON.stringify({
      documentType: 'status_page',
      machines: ['TASKalfa 4052ci', 'TASKalfa 2552ci'],
      date: '13/03/2026',
      parsedAt: new Date().toISOString(),
    }),
  },
}

async function run() {
  console.log(DRY_RUN ? '🔍 DRY RUN — no changes will be made\n' : '🔧 LIVE RUN — updating database\n')

  // Find all run-up jobs with no machine_model but have a PDF
  const { data: emptyJobs, error } = await supabase
    .from('jobs')
    .select('id, job_number, install_pdf_url, machine_model, special_instructions, notes')
    .like('job_number', 'RUNUP%')
    .is('machine_model', null)
    .not('install_pdf_url', 'is', null)

  if (error) {
    console.error('Query error:', error.message)
    process.exit(1)
  }

  console.log(`Found ${emptyJobs.length} empty run-up jobs with PDFs\n`)

  let fixed = 0
  let skipped = 0

  for (const job of emptyJobs) {
    // Extract the document filename from the PDF URL
    const pdfUrl = job.install_pdf_url || ''
    const filename = pdfUrl.split('/').pop() || ''
    
    // Match against known extracted data by document name (strip timestamp prefix)
    const docName = filename.replace(/^\d+_/, '') // Remove timestamp prefix like 1773385206447_
    const extracted = PDF_EXTRACTED_DATA[docName.replace('.pdf', '')]

    if (!extracted) {
      console.log(`⏭️  ${job.job_number}: No extracted data for ${docName}`)
      skipped++
      continue
    }

    // Build update payload — only set fields that have data and aren't already set
    const update = {}
    if (extracted.machine_model) update.machine_model = extracted.machine_model
    if (extracted.serial_number) update.serial_number = extracted.serial_number
    if (extracted.contact_name) update.contact_name = extracted.contact_name
    if (extracted.address_to) update.address_to = extracted.address_to
    if (extracted.address_from) update.address_from = extracted.address_from
    if (extracted.po_number) update.po_number = extracted.po_number
    if (extracted.tracking_number) update.tracking_number = extracted.tracking_number
    if (extracted.machine_accessories) update.machine_accessories = extracted.machine_accessories
    if (extracted.special_instructions) update.special_instructions = extracted.special_instructions
    
    // Append to existing notes
    if (extracted.notes_append) {
      const existingNotes = job.notes || ''
      update.notes = existingNotes 
        ? `${existingNotes}\n\n${extracted.notes_append}`
        : extracted.notes_append
    }

    if (Object.keys(update).length === 0) {
      console.log(`⏭️  ${job.job_number}: No new data to add`)
      skipped++
      continue
    }

    console.log(`📝 ${job.job_number}:`)
    if (update.machine_model) console.log(`   Model: ${update.machine_model}`)
    if (update.serial_number) console.log(`   Serial: ${update.serial_number}`)
    if (update.contact_name) console.log(`   Customer: ${update.contact_name}`)
    if (update.address_to) console.log(`   Address: ${update.address_to}`)
    if (update.machine_accessories) console.log(`   Accessories: ${update.machine_accessories}`)

    if (!DRY_RUN) {
      const { error: updateError } = await supabase
        .from('jobs')
        .update(update)
        .eq('id', job.id)

      if (updateError) {
        console.error(`   ❌ Update failed: ${updateError.message}`)
        continue
      }
      console.log(`   ✅ Updated`)
    } else {
      console.log(`   (dry run — would update)`)
    }
    fixed++
  }

  console.log(`\n${'='.repeat(40)}`)
  console.log(`Fixed ${fixed} of ${emptyJobs.length} empty run-ups`)
  if (skipped > 0) console.log(`Skipped ${skipped} (no extracted data available)`)
  if (DRY_RUN) console.log('\nRe-run without --dry-run to apply changes')
}

run().catch(e => { console.error('Fatal:', e); process.exit(1) })
