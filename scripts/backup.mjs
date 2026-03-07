#!/usr/bin/env node
// Weekly backup script for Honor Logistics
// Exports key tables to gzip JSON, emails via AgentMail
// Usage: node scripts/backup.mjs

import { createClient } from '@supabase/supabase-js'
import { writeFileSync, mkdirSync, readFileSync } from 'fs'
import { gzipSync } from 'zlib'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

// Load .env.local
const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, '..', '.env.local')
try {
  const envContent = readFileSync(envPath, 'utf-8')
  for (const line of envContent.split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/)
    if (match) {
      const key = match[1].trim()
      const val = match[2].trim()
      if (!process.env[key]) process.env[key] = val
    }
  }
} catch {
  console.log('No .env.local found, using environment variables')
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const AGENTMAIL_API_KEY = process.env.AGENTMAIL_API_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const TABLES = [
  'jobs',
  'billing_cycles',
  'storage_weekly',
  'runup_details',
  'install_details',
  'delivery_details',
]

const BACKUP_DIR = resolve(__dirname, '..', '..', 'honor-logistics-backups')
const dateStr = new Date().toISOString().split('T')[0]

async function main() {
  console.log(`Starting backup for ${dateStr}...`)

  const backup = {}

  for (const table of TABLES) {
    console.log(`  Exporting ${table}...`)
    const { data, error } = await supabase.from(table).select('*')
    if (error) {
      console.error(`  Error exporting ${table}:`, error.message)
      backup[table] = { error: error.message }
    } else {
      backup[table] = data
      console.log(`  ${table}: ${data.length} rows`)
    }
  }

  // Compress to gzip JSON
  const json = JSON.stringify(backup, null, 2)
  const gzipped = gzipSync(Buffer.from(json))

  // Save to disk
  mkdirSync(BACKUP_DIR, { recursive: true })
  const filePath = resolve(BACKUP_DIR, `${dateStr}.json.gz`)
  writeFileSync(filePath, gzipped)
  console.log(`Backup saved to ${filePath} (${(gzipped.length / 1024).toFixed(1)} KB)`)

  // Email via AgentMail
  if (AGENTMAIL_API_KEY) {
    console.log('Sending backup email via AgentMail...')
    try {
      const res = await fetch('https://api.agentmail.to/v0/inboxes/scotty_au@agentmail.to/messages', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${AGENTMAIL_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: ['scotty_au@agentmail.to'],
          subject: `Honor Logistics Backup ${dateStr}`,
          text: `Weekly backup completed.\nTables: ${TABLES.join(', ')}\nSize: ${(gzipped.length / 1024).toFixed(1)} KB`,
          attachments: [{
            filename: `${dateStr}.json.gz`,
            content: gzipped.toString('base64'),
          }],
        }),
      })
      if (res.ok) {
        console.log('Backup email sent successfully')
      } else {
        const text = await res.text()
        console.warn(`AgentMail response ${res.status}: ${text}`)
      }
    } catch (err) {
      console.warn('Failed to send backup email:', err.message)
    }
  } else {
    console.log('AGENTMAIL_API_KEY not set, skipping email')
  }

  console.log('Backup complete!')
}

main().catch((err) => {
  console.error('Backup failed:', err)
  process.exit(1)
})
