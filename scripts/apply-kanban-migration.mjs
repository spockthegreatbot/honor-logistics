#!/usr/bin/env node
/**
 * Run once to apply the kanban board migration.
 * Usage:  SUPABASE_DB_PASSWORD=<your-db-password> node scripts/apply-kanban-migration.mjs
 *
 * DB password is in Supabase dashboard → Settings → Database → Connection string
 */
import { createRequire } from 'module'
import { readFileSync } from 'fs'

const require = createRequire(import.meta.url)
const { Client } = require('pg')

const password = process.env.SUPABASE_DB_PASSWORD
if (!password) {
  console.error('Set SUPABASE_DB_PASSWORD env var first.')
  process.exit(1)
}

const sql = readFileSync(new URL('../supabase/migrations/20260310_kanban_fields.sql', import.meta.url).pathname, 'utf8')

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
console.log('✓ Migration 20260310_kanban_fields applied.')
