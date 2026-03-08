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

// Try to match an email to a job by scanning subject + body for reference patterns
function extractEfexReference(text: string): string | null {
  // EFEX reference patterns: e.g. "EFX-12345", "Order #12345", "Ref: 12345"
  const patterns = [
    /EFX[- ]?(\d+)/i,
    /order[:\s#]+(\d{4,})/i,
    /ref(?:erence)?[:\s#]+([A-Z0-9-]{4,})/i,
    /job[:\s#]+([A-Z0-9-]{4,})/i,
  ]
  for (const p of patterns) {
    const m = (text || '').match(p)
    if (m) return m[1]
  }
  return null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function findMatchingJob(supabase: any, emailFrom: string, subject: string, body: string): Promise<string | null> {
  const ref = extractEfexReference(subject + ' ' + body)
  if (ref) {
    const { data } = await supabase.from('jobs').select('id').or(`client_reference.ilike.%${ref}%,po_number.ilike.%${ref}%`).limit(1).single()
    if (data?.id) return data.id as string
  }
  const domain = emailFrom.split('@')[1]?.toLowerCase()
  if (domain) {
    const { data: cls } = await supabase.from('clients').select('id').ilike('billing_email', `%@${domain}`).limit(1)
    if (cls?.[0]?.id) {
      const { data: job } = await supabase.from('jobs').select('id').eq('client_id', cls[0].id).not('status', 'in', '(complete,completed,invoiced,cancelled)').order('created_at', { ascending: false }).limit(1).single()
      if (job?.id) return job.id as string
    }
  }
  return null
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
    if (emails.length === 0) return NextResponse.json({ processed: 0 })

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

      // ── Detect EFEX AOD PDF attachment ──────────────────────────────
      const aodAttachment = email.attachments.find(a =>
        a.contentType === 'application/pdf' &&
        (a.filename.toLowerCase().includes('aod') ||
         a.filename.toLowerCase().includes('acknowledgment') ||
         a.filename.toLowerCase().includes('delivery'))
      )

      let aodStorageUrl: string | null = null
      let attachedJobId: string | null = null

      if (aodAttachment) {
        // Upload to Supabase Storage
        const bucket = 'aod-documents'
        const timestamp = Date.now()
        const safeFilename = aodAttachment.filename.replace(/[^a-zA-Z0-9._-]/g, '_')
        const storagePath = `efex-aod/${timestamp}_${safeFilename}`

        // Ensure bucket exists
        await supabase.storage.createBucket(bucket, { public: false, fileSizeLimit: 20971520 }).catch(() => {})

        const { error: uploadErr } = await supabase.storage
          .from(bucket)
          .upload(storagePath, aodAttachment.content, {
            contentType: 'application/pdf',
            upsert: false,
          })

        if (!uploadErr) {
          const { data: signedUrl } = await supabase.storage
            .from(bucket)
            .createSignedUrl(storagePath, 60 * 60 * 24 * 365) // 1 year
          aodStorageUrl = signedUrl?.signedUrl ?? null

          // Try to link to a matching job
          attachedJobId = await findMatchingJob(supabase, email.from, email.subject, email.body)

          if (attachedJobId && aodStorageUrl) {
            await supabase
              .from('jobs')
              .update({ aod_pdf_url: aodStorageUrl, has_aod: true, updated_at: new Date().toISOString() })
              .eq('id', attachedJobId)
          }
        }
      }

      // ── Log email ───────────────────────────────────────────────────
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

      // ── Telegram alert ──────────────────────────────────────────────
      if (matchedClient) {
        const preview = email.body.slice(0, 200).replace(/\n+/g, ' ').trim()
        let msg =
          `📧 <b>New email from ${matchedClient.name}</b>\n` +
          `From: ${email.fromName} (${email.from})\n` +
          `Subject: ${email.subject}\n\n` +
          `${preview}${email.body.length > 200 ? '…' : ''}`

        if (aodAttachment) {
          msg += attachedJobId
            ? `\n\n📎 <b>AOD PDF auto-attached to job</b>`
            : `\n\n📎 <b>AOD PDF received</b> — no matching job found. Attach manually in CRM.`
        }

        msg += `\n\n<i>Review: https://crm.honorremovals.com.au/jobs</i>`
        await sendTelegram(msg)
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
