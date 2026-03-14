#!/usr/bin/env node
/**
 * One-time fix: patch orphan run-up jobs (missing client_id) and
 * Axus jobs with wrong order_types.
 *
 * Run: node scripts/fix-orphan-jobs.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const envFile = new URL('../.env.local', import.meta.url).pathname
const envVars = readFileSync(envFile, 'utf8').split('\n').reduce((acc, line) => {
  const m = line.match(/^([^=]+)=(.*)$/)
  if (m) acc[m[1].trim()] = m[2].trim()
  return acc
}, {})

const supabase = createClient(
  envVars.NEXT_PUBLIC_SUPABASE_URL,
  envVars.SUPABASE_SERVICE_ROLE_KEY
)

const EFEX_CLIENT_ID = 'e35458d3-eef4-41cc-8be7-e9d331a657d3'
const AXUS_CLIENT_ID = 'e539b28f-7ebc-4fa8-981e-a558c6ec88c0'

async function fixOrphanRunups() {
  console.log('🔧 Fixing orphan run-up jobs (missing client_id)...')

  const { data, error, count } = await supabase.from('jobs')
    .update({ client_id: EFEX_CLIENT_ID })
    .eq('job_type', 'runup')
    .is('client_id', null)
    .select('id, job_number')

  if (error) {
    console.error('❌ Error fixing run-up orphans:', error.message)
    return
  }

  console.log(`✅ Fixed ${data.length} orphan run-up jobs:`)
  data.forEach(j => console.log(`   - ${j.job_number}`))
}

async function fixAxusOrderTypes() {
  console.log('\n🔧 Fixing Axus jobs with wrong order_types...')

  // Fetch all Axus jobs that don't have order_types = ["toner"]
  const { data: axusJobs, error: fetchErr } = await supabase.from('jobs')
    .select('id, job_number, job_type, order_types')
    .eq('client_id', AXUS_CLIENT_ID)

  if (fetchErr) {
    console.error('❌ Error fetching Axus jobs:', fetchErr.message)
    return
  }

  const needsFix = axusJobs.filter(j => {
    const ot = j.order_types
    if (!ot) return true
    if (Array.isArray(ot) && ot.length === 1 && ot[0] === 'toner') return false
    return true
  })

  if (needsFix.length === 0) {
    console.log('✅ All Axus jobs already have correct order_types')
    return
  }

  let fixed = 0
  for (const job of needsFix) {
    const { error } = await supabase.from('jobs')
      .update({ job_type: 'toner', order_types: ['toner'] })
      .eq('id', job.id)
    if (error) {
      console.error(`  ❌ Failed to fix ${job.job_number}: ${error.message}`)
    } else {
      console.log(`  ✅ ${job.job_number}: ${JSON.stringify(job.order_types)} → ["toner"]`)
      fixed++
    }
  }

  console.log(`✅ Fixed ${fixed}/${needsFix.length} Axus jobs`)
}

async function main() {
  console.log('=== Fix Orphan Jobs — One-Time Migration ===\n')
  await fixOrphanRunups()
  await fixAxusOrderTypes()
  console.log('\n=== Done ===')
}

main().catch(console.error)
