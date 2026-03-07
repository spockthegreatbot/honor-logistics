import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { fetchUnreadEmails, markAsRead } from '@/lib/imap'

// POST /api/email/poll — called by cron or manually
// Fetches unread emails, logs them to email_log, flags known senders
export async function POST(req: NextRequest) {
  // Simple auth: require internal secret or service call
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
      return NextResponse.json({ processed: 0, message: 'No new emails' })
    }

    // Load known client email domains for matching
    const { data: clients } = await supabase
      .from('clients')
      .select('id, name, contact_email')

    const processed: string[] = []
    const uidsToMark: number[] = []

    for (const email of emails) {
      // Try to match sender to a client
      const senderDomain = email.from.split('@')[1]?.toLowerCase()
      const matchedClient = clients?.find(c => {
        const clientDomain = c.contact_email?.split('@')[1]?.toLowerCase()
        return clientDomain && clientDomain === senderDomain
      })

      // Log to email_log table
      const { error: logError } = await supabase.from('email_log').insert({
        direction: 'inbound',
        from_email: email.from,
        from_name: email.fromName,
        from_address: email.from,
        subject: email.subject,
        body_text: email.body,
        body_preview: email.body.slice(0, 500),
        received_at: email.receivedAt.toISOString(),
        client_id: matchedClient?.id ?? null,
        ms_message_id: email.messageId, // reusing this field for IMAP UID
        raw_message_id: email.messageId,
        status: 'received',
        processed: false,
      })

      if (logError) {
        console.error('Failed to log email:', logError)
        continue
      }

      uidsToMark.push(email.uid)
      processed.push(`${email.from}: ${email.subject}`)
    }

    // Mark all processed emails as read
    await markAsRead(uidsToMark)

    return NextResponse.json({
      processed: processed.length,
      emails: processed,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('IMAP poll error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// GET /api/email/poll — manual trigger from UI (admin only)
export async function GET(req: NextRequest) {
  // Reuse POST logic for convenience — same auth
  return POST(req)
}
