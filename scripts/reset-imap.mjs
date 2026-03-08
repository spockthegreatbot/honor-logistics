#!/usr/bin/env node
import { ImapFlow } from 'imapflow'
import { readFileSync } from 'fs'

const envFile = new URL('../.env.local', import.meta.url).pathname
const env = readFileSync(envFile, 'utf8').split('\n').reduce((acc, l) => {
  const m = l.match(/^([^=]+)=(.*)$/); if (m) acc[m[1].trim()] = m[2].trim(); return acc
}, {})

const client = new ImapFlow({
  host: env.IMAP_HOST, port: Number(env.IMAP_PORT ?? 993), secure: true,
  auth: { user: env.IMAP_USER, pass: env.IMAP_PASS }, logger: false,
})

await client.connect()
await client.mailboxOpen('INBOX')
// Mark ALL as unseen so we can re-process
await client.messageFlagsRemove('1:*', ['\\Seen'])
console.log('✅ All emails marked unread')
await client.logout()
