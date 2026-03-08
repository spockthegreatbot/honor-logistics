#!/usr/bin/env node
// Run directly on VPS: node scripts/poll-emails.mjs
import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

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

// Telegram alerts disabled — Honor bot handles orders directly in group
function sendTelegram(_text) { return }

const SKIP_REFS = new Set(['example', 'here', 'this', 'note', 'info', 'email', 'http', 'https'])

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

// Map EFEX order type labels to valid job_type constraint values
const ORDER_TYPE_MAP = {
  delivery: 'delivery',
  installation: 'install',
  pickup: 'collection',
  relocation: 'delivery',  // closest valid type
  collection: 'collection',
}

const SKIP_DOMAINS = ['xero.com', 'post.xero.com', 'myob.com', 'quickbooks.com', 'stripe.com', 'dominos.com.au']
const SPAM_INDICATORS = ['***SPAM***', 'unsubscribe', 'SEO report', '4K', 'channels', 'website design']

function isEfexJobRequest(subject, body, fromEmail) {
  // Skip known non-job senders
  const domain = (fromEmail || '').split('@')[1]?.toLowerCase() ?? ''
  if (SKIP_DOMAINS.some(d => domain.includes(d))) return false
  if (SPAM_INDICATORS.some(s => subject.includes(s))) return false

  const combined = (subject + ' ' + body).toLowerCase()
  return (
    combined.includes('delivery') || combined.includes('install') ||
    combined.includes('pick-up') || combined.includes('collection') ||
    combined.includes('relocation') || combined.includes('booking') ||
    combined.includes('efex')
  ) && !combined.includes('acknowledgment') && !combined.includes('invoice')
}

async function createJobFromEmail(body, subject) {
  try {
    const { data: efexClient } = await supabase.from('clients').select('id').ilike('name', '%efex%').limit(1).single()
    const clientId = efexClient?.id ?? null

    const combined = subject + '\n' + body
    const orderTypes = detectOrderTypes(combined)
    const jobType = ORDER_TYPE_MAP[orderTypes[0]] ?? 'delivery'
    const ref = extractEfexReference(combined)

    const contactName = extractField(combined, 'contact', 'best contact', 'contact person', 'attn', 'site contact')
    const contactPhone = extractField(combined, 'phone', 'mobile', 'tel', 'contact number', 'ph')
    const scheduledDateRaw = extractField(combined, 'delivery date', 'install date', 'booking date')
    // Priority: date from subject line (most reliable), then field, then full body
    const scheduledDate = extractDate(subject) ?? (scheduledDateRaw ? extractDate(scheduledDateRaw) : null) ?? extractDate(combined)
    const scheduledTime = extractField(combined, 'time', 'delivery time', 'arrival time')
    const machineModel = extractField(combined, 'model', 'machine', 'unit', 'part', 'product')  // goes into notes
    const machineSerial = extractField(combined, 'serial', 's/n', 'serial no', 'serial number')
    const machineAccessories = extractField(combined, 'accessories', 'accessory', 'add-on')
    const addressTo = extractField(combined, 'delivery address', 'install address', 'site address', 'address', 'deliver to', 'location')
    const addressFrom = orderTypes.includes('relocation') ? extractField(combined, 'collect from', 'pickup from', 'from address') : null
    const specialInstructions = extractField(combined, 'special instructions', 'notes', 'comments', 'instructions')
    const stairMatch = combined.match(/stair\s*walker[:\s]*(yes|no)/i)
    const parkingMatch = combined.match(/parking[:\s]*(yes|no)/i)
    const stairWalker = stairMatch ? stairMatch[1].toLowerCase() === 'yes' : null
    const parking = parkingMatch ? parkingMatch[1].toLowerCase() === 'yes' : null

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

    const { data: newJob, error } = await supabase.from('jobs').insert({
      job_number: jobNumber,
      job_type: jobType,
      order_types: orderTypes,
      status: 'new',
      client_id: clientId,
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
      parking: parking,
      special_instructions: specialInstructions,
      has_aod: false,
      notes: `Auto-created from email — review and update fields as needed.\nSubject: ${subject}${machineModel ? '\nMachine: ' + machineModel : ''}`,
    }).select('id, job_number').single()

    if (error) throw error
    return { ...newJob, duplicate: false }
  } catch (e) {
    console.error('  ❌ Create error:', e.message)
    return null
  }
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
          contentType: a.contentType,
          content: a.content,
        }))
      }
    } catch (e) {
      console.error('  Parse error:', e.message)
    }

    console.log(`\n📧 From: ${fromName} <${from}>`)
    console.log(`   Subject: ${subject}`)

    // Detect AOD PDF
    const aodAttach = attachments.find(a =>
      a.contentType === 'application/pdf' &&
      (a.filename.toLowerCase().includes('aod') || a.filename.toLowerCase().includes('acknowledgment'))
    )

    if (aodAttach) {
      console.log(`  📎 AOD PDF: ${aodAttach.filename}`)
      // Also create a job if the email body is a job request (e.g. install booking + AOD together)
      if (isEfexJobRequest(subject, body, from)) {
        console.log(`  🆕 Also a job request — creating job`)
        await createJobFromEmail(body, subject)
      }
    }

    if (!aodAttach && isEfexJobRequest(subject, body, from)) {
      console.log(`  🆕 EFEX job request detected`)
      const result = await createJobFromEmail(body, subject)

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
