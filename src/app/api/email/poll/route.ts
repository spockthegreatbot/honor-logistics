import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { fetchUnreadEmails, markAsRead } from '@/lib/imap'

const BOT_TOKEN = process.env.HONOR_BOT_TOKEN!
const GROUP_CHAT_ID = process.env.HONOR_GROUP_CHAT_ID!

async function sendTelegram(text: string) {
  if (!BOT_TOKEN || !GROUP_CHAT_ID) return
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: GROUP_CHAT_ID, text, parse_mode: 'HTML' }),
  })
}

// POST /api/email/poll — called by cron every 10 minutes
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET ?? 'honor-cron-secret'
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    const emails = await fetchUnreadEmails()

    if (emails.length === 0) {
      return NextResponse.json({ processed: 0 })
    }

    const { data: clients } = await supabase
      .from('clients')
      .select('id, name, billing_email')

    const uidsToMark: number[] = []
    let processedCount = 0

    for (const email of emails) {
      const senderDomain = email.from.split('@')[1]?.toLowerCase()

      const matchedClient = clients?.find(c => {
        const clientDomain = c.billing_email?.split('@')[1]?.toLowerCase()
        return clientDomain && clientDomain === senderDomain
      })

      // Log to email_log
      await supabase.from('email_log').insert({
        direction: 'inbound',
        from_email: email.from,
        from_name: email.fromName,
        from_address: email.from,
        subject: email.subject,
        body_text: email.body,
        body_preview: email.body.slice(0, 500),
        received_at: email.receivedAt.toISOString(),
        client_id: matchedClient?.id ?? null,
        ms_message_id: email.messageId,
        raw_message_id: email.messageId,
        status: 'received',
        processed: false,
      })

      // Telegram alert for known clients only
      if (matchedClient) {
        const preview = email.body.slice(0, 200).replace(/\n+/g, ' ').trim()
        await sendTelegram(
          `📧 <b>New email from ${matchedClient.name}</b>\n` +
          `From: ${email.fromName} (${email.from})\n` +
          `Subject: ${email.subject}\n\n` +
          `${preview}${email.body.length > 200 ? '…' : ''}\n\n` +
          `<i>Log in to review: https://crm.honorremovals.com.au/jobs</i>`
        )
      }

      uidsToMark.push(email.uid)
      processedCount++
    }

    await markAsRead(uidsToMark)

    return NextResponse.json({ processed: processedCount })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('IMAP poll error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
