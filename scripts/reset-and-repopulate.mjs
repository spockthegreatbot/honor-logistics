#!/usr/bin/env node
/**
 * reset-and-repopulate.mjs
 * 1. Hard-deletes ALL jobs from Supabase (fresh slate)
 * 2. Marks Axus + EFEX emails received since Monday (2026-03-09) as UNSEEN in IMAP
 * 3. Runs the main poll-emails.mjs to recreate jobs from those emails
 */

import { ImapFlow } from 'imapflow'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { execSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Load env
const envFile = path.join(__dirname, '../.env.local')
const envVars = readFileSync(envFile, 'utf8').split('\n').reduce((acc, line) => {
  const m = line.match(/^([^=]+)=(.*)$/)
  if (m) acc[m[1].trim()] = m[2].trim()
  return acc
}, {})

const SUPABASE_URL = envVars.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY  = envVars.SUPABASE_SERVICE_ROLE_KEY
const IMAP_HOST    = envVars.IMAP_HOST
const IMAP_PORT    = Number(envVars.IMAP_PORT ?? 993)
const IMAP_USER    = envVars.IMAP_USER
const IMAP_PASS    = envVars.IMAP_PASS

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

// ── STEP 1: Hard-delete all jobs ─────────────────────────────────────────────
console.log('\n🗑️  Step 1: Hard-deleting all jobs...')
const { error: delErr, count } = await supabase
  .from('jobs')
  .delete({ count: 'exact' })
  .neq('id', '00000000-0000-0000-0000-000000000000') // match all rows

if (delErr) {
  console.error('❌ Delete failed:', delErr.message)
  process.exit(1)
}
console.log(`✅ Deleted all jobs (${count ?? 'unknown count'} rows)`)

// ── STEP 2: Mark relevant emails as unread since Monday ──────────────────────
console.log('\n📬 Step 2: Marking emails as UNSEEN since 2026-03-09...')

const imap = new ImapFlow({
  host: IMAP_HOST,
  port: IMAP_PORT,
  secure: true,
  auth: { user: IMAP_USER, pass: IMAP_PASS },
  logger: false,
  tls: { rejectUnauthorized: false },
})

await imap.connect()
await imap.mailboxOpen('INBOX')

// Search for emails from Axus + EFEX since Monday 09 Mar 2026
const since = new Date('2026-03-09T00:00:00+10:00') // Sydney Monday midnight

const uidsToMark = []
for await (const msg of imap.fetch(
  { from: 'support@axusgroup.com.au', since },
  { uid: true, envelope: true }
)) {
  uidsToMark.push(msg.uid)
  console.log(`  📧 Axus: [${msg.uid}] ${msg.envelope?.subject}`)
}
for await (const msg of imap.fetch(
  { from: '@efex.com.au', since },
  { uid: true, envelope: true }
)) {
  uidsToMark.push(msg.uid)
  console.log(`  📧 EFEX: [${msg.uid}] ${msg.envelope?.subject}`)
}

if (uidsToMark.length === 0) {
  console.log('⚠️  No matching emails found in IMAP since Monday.')
} else {
  await imap.messageFlagsRemove(uidsToMark, ['\\Seen'])
  console.log(`✅ Marked ${uidsToMark.length} emails as UNSEEN`)
}

await imap.logout()

// ── STEP 3: Run the main poller ───────────────────────────────────────────────
if (uidsToMark.length > 0) {
  console.log('\n📨 Step 3: Running poll-emails.mjs to recreate jobs...\n')
  execSync(`node ${path.join(__dirname, 'poll-emails.mjs')}`, { stdio: 'inherit' })
  console.log('\n✅ Done. Check the board at https://crm.honorremovals.com.au/jobs')
} else {
  console.log('\n⚠️  No emails to re-process. Jobs cleared but board is empty.')
}
