// One-off: re-scan INBOX from a given date (ALL messages, not just UNSEEN)
// Dedup logic in createAxusJob/createJobFromEmail prevents double-creates
import { fileURLToPath } from 'url'
import path from 'path'
import { readFileSync } from 'fs'

// Patch the poll-emails module to use ALL + date range instead of UNSEEN
// We do this by importing the module and monkey-patching fetchEmails

// Simpler: just invoke poll-emails.mjs after temporarily setting RESCAN_SINCE env
process.env.RESCAN_SINCE = '2026-03-08' // Sunday

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// Dynamic import will pick up RESCAN_SINCE
await import('./poll-emails.mjs')
