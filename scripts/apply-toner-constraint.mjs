#!/usr/bin/env node
/**
 * Apply migration: add 'toner' to jobs_job_type_check constraint.
 * Usage: SUPABASE_DB_PASSWORD=<password> node scripts/apply-toner-constraint.mjs
 * DB password: Supabase dashboard → Settings → Database → Database password
 */
import { createRequire } from 'module'
import { readFileSync } from 'fs'

const require = createRequire(import.meta.url)
const { Client } = require('pg')

const password = process.env.SUPABASE_DB_PASSWORD
if (!password) {
  console.error('Set SUPABASE_DB_PASSWORD env var first.')
  console.error('Get it from: Supabase dashboard → Settings → Database → Database password')
  process.exit(1)
}

const sql = readFileSync(new URL('../supabase/migrations/20260311_add_toner_job_type.sql', import.meta.url).pathname, 'utf8')

const client = new Client({
  host: 'db.ablgxcbebsdsdocmffyk.supabase.co',
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password,
  ssl: { rejectUnauthorized: false },
})

await client.connect()
await client.query(sql)
await client.end()
console.log('✓ Migration 20260311_add_toner_job_type applied.')
console.log('Now run: node scripts/fix-axus-job-types.mjs')
