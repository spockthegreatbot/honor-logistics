#!/usr/bin/env node
// One-time migration: extract machine_model from notes into the new column
// Run once: node scripts/migrate-machine-model.mjs
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

async function migrate() {
  // Find jobs where machine_model is NULL and notes contain "Machine: ..."
  const { data: jobs, error } = await supabase
    .from('jobs')
    .select('id, job_number, notes, machine_model')
    .is('machine_model', null)
    .ilike('notes', '%Machine: %')

  if (error) {
    console.error('Query error:', error.message)
    process.exit(1)
  }

  console.log(`Found ${jobs.length} jobs with machine model in notes`)

  for (const job of jobs) {
    const match = job.notes?.match(/Machine: ([^\n]+)/)
    if (!match) continue

    const machineModel = match[1].trim()
    // Remove the "Machine: X" line from notes
    const cleanedNotes = job.notes
      .replace(/\nMachine: [^\n]+/, '')
      .replace(/Machine: [^\n]+\n?/, '')
      .trim()

    console.log(`  ${job.job_number}: "${machineModel}"`)

    const { error: updateErr } = await supabase
      .from('jobs')
      .update({
        machine_model: machineModel,
        notes: cleanedNotes || null,
      })
      .eq('id', job.id)

    if (updateErr) {
      console.error(`  ERROR updating ${job.job_number}:`, updateErr.message)
    } else {
      console.log(`  OK`)
    }
  }

  console.log('Done.')
}

migrate().catch(e => { console.error('Fatal:', e); process.exit(1) })
