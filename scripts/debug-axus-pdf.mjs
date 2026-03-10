#!/usr/bin/env node
// Debug: extract and show raw text from one Axus job PDF
import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import { readFileSync } from 'fs'
import { PDFParse } from 'pdf-parse'

const envVars = readFileSync(new URL('../.env.local', import.meta.url).pathname, 'utf8')
  .split('\n').reduce((acc, line) => {
    const m = line.match(/^([^=]+)=(.*)$/)
    if (m) acc[m[1].trim()] = m[2].trim()
    return acc
  }, {})

const client = new ImapFlow({
  host: envVars.IMAP_HOST, port: 993, secure: true,
  auth: { user: envVars.IMAP_USER, pass: envVars.IMAP_PASS }, logger: false,
})

await client.connect()
await client.mailboxOpen('INBOX')

// Fetch UID 55 (first real Axus job)
for await (const full of client.fetch('55', { source: true }, { uid: true })) {
  const parsed = await simpleParser(full.source)
  const axusPdf = parsed.attachments?.find(a =>
    a.filename?.toLowerCase().startsWith('job nocomment') &&
    a.filename?.toLowerCase().endsWith('.pdf')
  )
  if (axusPdf) {
    console.log('PDF filename:', axusPdf.filename)
    const parser = new PDFParse({ data: axusPdf.content })
    const result = await parser.getText()
    console.log('\n=== RAW PDF TEXT ===')
    console.log(result.text)
    console.log('===================')
  } else {
    console.log('No Axus PDF found in email')
    console.log('Attachments:', parsed.attachments?.map(a => a.filename))
  }
}

await client.logout()
