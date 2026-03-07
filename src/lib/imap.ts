import { ImapFlow } from 'imapflow'

export interface ParsedEmail {
  uid: number
  messageId: string
  from: string
  fromName: string
  subject: string
  body: string
  receivedAt: Date
  raw: string
}

export async function fetchUnreadEmails(): Promise<ParsedEmail[]> {
  const client = new ImapFlow({
    host: process.env.IMAP_HOST!,
    port: Number(process.env.IMAP_PORT ?? 993),
    secure: true,
    auth: {
      user: process.env.IMAP_USER!,
      pass: process.env.IMAP_PASS!,
    },
    logger: false,
  })

  const emails: ParsedEmail[] = []

  await client.connect()

  try {
    const lock = await client.getMailboxLock('INBOX')
    try {
      // Fetch unseen messages
      for await (const msg of client.fetch({ seen: false }, {
        uid: true,
        envelope: true,
        bodyStructure: true,
        source: true,
      })) {
        const from = msg.envelope.from?.[0]
        const fromAddress = from ? `${from.mailbox}@${from.host}` : 'unknown'
        const fromName = from?.name ?? fromAddress

        const raw = msg.source?.toString() ?? ''
        // Extract plain text body (simple approach — strips HTML tags)
        const body = extractPlainText(raw)

        emails.push({
          uid: msg.uid,
          messageId: msg.envelope.messageId ?? String(msg.uid),
          from: fromAddress,
          fromName,
          subject: msg.envelope.subject ?? '(no subject)',
          body,
          receivedAt: msg.envelope.date ?? new Date(),
          raw,
        })
      }
    } finally {
      lock.release()
    }
  } finally {
    await client.logout()
  }

  return emails
}

export async function markAsRead(uids: number[]): Promise<void> {
  if (uids.length === 0) return

  const client = new ImapFlow({
    host: process.env.IMAP_HOST!,
    port: Number(process.env.IMAP_PORT ?? 993),
    secure: true,
    auth: {
      user: process.env.IMAP_USER!,
      pass: process.env.IMAP_PASS!,
    },
    logger: false,
  })

  await client.connect()
  try {
    const lock = await client.getMailboxLock('INBOX')
    try {
      await client.messageFlagsAdd({ uid: uids as unknown as string }, ['\\Seen'])
    } finally {
      lock.release()
    }
  } finally {
    await client.logout()
  }
}

function extractPlainText(raw: string): string {
  // Find Content-Type: text/plain section
  const plainMatch = raw.match(/Content-Type: text\/plain[^\n]*\n(?:[^\n]+\n)*\n([\s\S]*?)(?=--|\n\n--|\z)/i)
  if (plainMatch) return plainMatch[1].trim()

  // Fallback: strip HTML tags
  return raw
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 2000)
}
