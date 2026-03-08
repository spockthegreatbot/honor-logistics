import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'

export interface EmailAttachment {
  filename: string
  contentType: string
  content: Buffer
}

export interface ParsedEmail {
  uid: number
  messageId: string
  from: string
  fromName: string
  subject: string
  body: string
  receivedAt: Date
  raw: string
  attachments: EmailAttachment[]
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
      for await (const msg of client.fetch({ seen: false }, {
        uid: true,
        envelope: true,
        source: true,
      })) {
        const envelope = msg.envelope
        const from = envelope?.from?.[0]
        const fromAddress = from?.address ?? 'unknown'
        const fromName = from?.name ?? fromAddress

        const raw = msg.source?.toString() ?? ''

        // Parse with mailparser to get body + attachments
        let body = ''
        const attachments: EmailAttachment[] = []
        try {
          const parsed = await simpleParser(raw)
          body = parsed.text ?? (typeof parsed.html === 'string' ? parsed.html.replace(/<[^>]+>/g, ' ') : '') ?? ''
          for (const att of parsed.attachments ?? []) {
            if (att.content && att.filename) {
              attachments.push({
                filename: att.filename,
                contentType: att.contentType ?? 'application/octet-stream',
                content: att.content,
              })
            }
          }
        } catch {
          body = extractPlainText(raw)
        }

        emails.push({
          uid: msg.uid,
          messageId: envelope?.messageId ?? `uid-${msg.uid}`,
          from: fromAddress,
          fromName,
          subject: envelope?.subject ?? '(no subject)',
          body,
          receivedAt: envelope?.date ?? new Date(),
          raw,
          attachments,
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
      await client.messageFlagsAdd(uids.join(','), ['\\Seen'])
    } finally {
      lock.release()
    }
  } finally {
    await client.logout()
  }
}

function extractPlainText(raw: string): string {
  const lines = raw.split('\n')
  const bodyStart = lines.findIndex((l) => l.trim() === '')
  if (bodyStart === -1) return raw.slice(0, 500)
  return lines
    .slice(bodyStart + 1)
    .join('\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .slice(0, 2000)
}
