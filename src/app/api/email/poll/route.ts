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

// ── Parsers ──────────────────────────────────────────────────────────────────

function extractEfexReference(text: string): string | null {
  const patterns = [
    /EFX[- ]?(\d+)/i,
    /#(\d{5,})/,
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

function extractField(text: string, ...labels: string[]): string | null {
  for (const label of labels) {
    const re = new RegExp(`${label}[:\\s]*([^\\n\\r]{2,80})`, 'i')
    const m = text.match(re)
    if (m) {
      const val = m[1].trim().replace(/\s+/g, ' ')
      if (val && val.length > 1) return val
    }
  }
  return null
}

function detectOrderTypes(text: string): string[] {
  const types: string[] = []
  const t = text.toLowerCase()
  // Check for explicit tick patterns or field headers
  if (/deliv(ery)?/.test(t) && !/no deliv/i.test(t)) types.push('delivery')
  if (/install/.test(t)) types.push('installation')
  if (/pick.?up|collection/.test(t)) types.push('pickup')
  if (/reloc/.test(t)) types.push('relocation')
  // De-dup, keep first occurrence order
  return [...new Set(types)]
}

function extractDate(text: string): string | null {
  // DD/MM/YYYY or DD-MM-YYYY or "12 March 2026"
  const patterns = [
    /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/,
    /(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{4})/i,
  ]
  for (const p of patterns) {
    const m = text.match(p)
    if (m) {
      if (m.length === 4 && isNaN(Number(m[2]))) {
        // "12 March 2026" → convert to ISO
        const months: Record<string, string> = {
          jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',
          jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12'
        }
        const mo = months[m[2].toLowerCase().slice(0,3)]
        return mo ? `${m[3]}-${mo}-${m[1].padStart(2,'0')}` : null
      }
      // DD/MM/YYYY
      return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`
    }
  }
  return null
}

function isEfexJobRequest(subject: string, body: string): boolean {
  const combined = (subject + ' ' + body).toLowerCase()
  return (
    combined.includes('delivery') ||
    combined.includes('install') ||
    combined.includes('pick-up') ||
    combined.includes('relocation') ||
    combined.includes('efex') ||
    combined.includes('job request') ||
    combined.includes('order request')
  ) && !combined.includes('aod') && !combined.includes('acknowledgment')
}

// ── Job creation ─────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createJobFromEmail(supabase: any, emailBody: string, emailSubject: string): Promise<string | null> {
  try {
    // Get EFEX client ID
    const { data: efexClient } = await supabase
      .from('clients')
      .select('id')
      .ilike('name', '%efex%')
      .limit(1)
      .single()

    const clientId = efexClient?.id ?? null

    const combinedText = emailSubject + '\n' + emailBody

    // Parse order types
    const orderTypes = detectOrderTypes(combinedText)
    const jobType = orderTypes[0] ?? 'delivery'

    // Parse reference
    const ref = extractEfexReference(combinedText)

    // Parse all EFEX fields
    const contactName = extractField(combinedText,
      'contact', 'best contact', 'contact person', 'attn', 'site contact'
    )
    const contactPhone = extractField(combinedText,
      'phone', 'mobile', 'tel', 'contact number', 'ph'
    )
    const scheduledDateRaw = extractField(combinedText,
      'delivery date', 'install date', 'date', 'scheduled', 'booking date'
    )
    const scheduledDate = scheduledDateRaw ? extractDate(scheduledDateRaw) : extractDate(combinedText)
    const scheduledTime = extractField(combinedText,
      'time', 'delivery time', 'arrival time'
    )
    const machineModel = extractField(combinedText,
      'model', 'machine', 'unit', 'part', 'product'
    )
    const machineSerial = extractField(combinedText,
      'serial', 's/n', 'serial no', 'serial number'
    )
    const machineAccessories = extractField(combinedText,
      'accessories', 'accessory', 'add-on'
    )
    const addressTo = extractField(combinedText,
      'delivery address', 'install address', 'site address', 'address', 'deliver to', 'location'
    )
    const addressFrom = orderTypes.includes('relocation')
      ? extractField(combinedText, 'collect from', 'pickup from', 'from address', 'collection address')
      : null
    const specialInstructions = extractField(combinedText,
      'special instructions', 'notes', 'comments', 'special requirements', 'instructions'
    )

    // Stair walker / parking — look for yes/no near keywords
    const stairMatch = combinedText.match(/stair\s*walker[:\s]*(yes|no)/i)
    const parkingMatch = combinedText.match(/parking[:\s]*(yes|no)/i)
    const stairWalker = stairMatch ? stairMatch[1].toLowerCase() === 'yes' : null
    const parking = parkingMatch ? parkingMatch[1].toLowerCase() === 'yes' : null

    // End customer — look for customer/company field
    const endCustomerName = extractField(combinedText,
      'customer', 'company', 'client', 'end.?user', 'site'
    )

    // Look up end_customer if we have a name
    let endCustomerId: string | null = null
    if (endCustomerName && clientId) {
      const { data: ec } = await supabase
        .from('end_customers')
        .select('id')
        .ilike('name', `%${endCustomerName.split(' ')[0]}%`)
        .eq('client_id', clientId)
        .limit(1)
        .single()
      endCustomerId = ec?.id ?? null
    }

    // Generate job number: HRL-YYYY-XXXX
    const year = new Date().getFullYear()
    const { count } = await supabase.from('jobs').select('*', { count: 'exact', head: true })
    const seq = String((count ?? 0) + 1).padStart(4, '0')
    const jobNumber = `HRL-${year}-${seq}`

    const { data: newJob, error } = await supabase.from('jobs').insert({
      job_number: jobNumber,
      job_type: jobType,
      order_types: orderTypes,
      status: 'new',
      client_id: clientId,
      end_customer_id: endCustomerId,
      client_reference: ref,
      contact_name: contactName,
      contact_phone: contactPhone,
      scheduled_date: scheduledDate,
      scheduled_time: scheduledTime,
      serial_number: machineSerial,
      machine_model: machineModel,
      machine_accessories: machineAccessories,
      address_to: addressTo,
      address_from: addressFrom,
      stair_walker: stairWalker,
      parking: parking,
      special_instructions: specialInstructions,
      has_aod: false,
      notes: `Auto-created from email. Review and update fields as needed.`,
    }).select('id').single()

    if (error) {
      console.error('Job create error:', error)
      return null
    }

    return newJob?.id ?? null
  } catch (e) {
    console.error('createJobFromEmail error:', e)
    return null
  }
}

// ── AOD attachment handler ────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function findMatchingJob(supabase: any, emailFrom: string, subject: string, body: string): Promise<string | null> {
  const ref = extractEfexReference(subject + ' ' + body)
  if (ref) {
    const { data } = await supabase.from('jobs').select('id')
      .or(`client_reference.ilike.%${ref}%,po_number.ilike.%${ref}%`).limit(1).single()
    if (data?.id) return data.id as string
  }
  const domain = emailFrom.split('@')[1]?.toLowerCase()
  if (domain) {
    const { data: cls } = await supabase.from('clients').select('id').ilike('billing_email', `%@${domain}`).limit(1)
    if (cls?.[0]?.id) {
      const { data: job } = await supabase.from('jobs').select('id')
        .eq('client_id', cls[0].id)
        .not('status', 'in', '(complete,completed,invoiced,cancelled)')
        .order('created_at', { ascending: false }).limit(1).single()
      if (job?.id) return job.id as string
    }
  }
  return null
}

// ── Main handler ─────────────────────────────────────────────────────────────

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

    const { data: clients } = await supabase.from('clients').select('id, name, billing_email')
    const uidsToMark: number[] = []
    let processedCount = 0
    const results: string[] = []

    for (const email of emails) {
      const senderDomain = email.from.split('@')[1]?.toLowerCase()
      const matchedClient = clients?.find(c => {
        const clientDomain = c.billing_email?.split('@')[1]?.toLowerCase()
        return clientDomain && clientDomain === senderDomain
      })

      // ── 1. Detect EFEX AOD PDF ────────────────────────────────────
      const aodAttachment = email.attachments.find((a: { contentType: string; filename: string }) =>
        a.contentType === 'application/pdf' &&
        (a.filename.toLowerCase().includes('aod') ||
         a.filename.toLowerCase().includes('acknowledgment') ||
         a.filename.toLowerCase().includes('delivery'))
      )

      let aodStorageUrl: string | null = null
      let attachedJobId: string | null = null

      if (aodAttachment) {
        const bucket = 'aod-documents'
        const timestamp = Date.now()
        const safeFilename = (aodAttachment as { filename: string }).filename.replace(/[^a-zA-Z0-9._-]/g, '_')
        const storagePath = `efex-aod/${timestamp}_${safeFilename}`

        await supabase.storage.createBucket(bucket, { public: false, fileSizeLimit: 20971520 }).catch(() => {})

        const { error: uploadErr } = await supabase.storage
          .from(bucket)
          .upload(storagePath, (aodAttachment as { content: Buffer }).content, {
            contentType: 'application/pdf',
            upsert: false,
          })

        if (!uploadErr) {
          const { data: signedUrl } = await supabase.storage
            .from(bucket)
            .createSignedUrl(storagePath, 60 * 60 * 24 * 365)
          aodStorageUrl = signedUrl?.signedUrl ?? null

          attachedJobId = await findMatchingJob(supabase, email.from, email.subject, email.body)
          if (attachedJobId && aodStorageUrl) {
            await supabase.from('jobs').update({ aod_pdf_url: aodStorageUrl, has_aod: true, updated_at: new Date().toISOString() }).eq('id', attachedJobId)
          }
        }
      }

      // ── 2. Detect & create EFEX job request ──────────────────────
      let createdJobId: string | null = null
      let createdJobNumber: string | null = null

      if (!aodAttachment && isEfexJobRequest(email.subject, email.body)) {
        // Check we haven't already created a job for this reference
        const ref = extractEfexReference(email.subject + ' ' + email.body)
        let alreadyExists = false
        if (ref) {
          const { data: existing } = await supabase.from('jobs').select('id, job_number')
            .or(`client_reference.ilike.%${ref}%`).limit(1).single()
          if (existing?.id) {
            alreadyExists = true
            createdJobId = existing.id
            createdJobNumber = existing.job_number
          }
        }

        if (!alreadyExists) {
          createdJobId = await createJobFromEmail(supabase, email.body, email.subject)
          if (createdJobId) {
            const { data: j } = await supabase.from('jobs').select('job_number').eq('id', createdJobId).single()
            createdJobNumber = j?.job_number ?? null
          }
        }
      }

      // ── 3. Log to email_log ───────────────────────────────────────
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
        processed: createdJobId !== null || attachedJobId !== null,
      })

      // ── 4. Telegram alert ─────────────────────────────────────────
      if (createdJobId && createdJobNumber) {
        const orderTypes = detectOrderTypes(email.subject + ' ' + email.body)
        const ref = extractEfexReference(email.subject + ' ' + email.body)
        await sendTelegram(
          `🆕 <b>New EFEX Job Created — ${createdJobNumber}</b>\n` +
          `📋 Type: ${orderTypes.join(' + ') || 'Delivery'}\n` +
          (ref ? `📎 Ref: ${ref}\n` : '') +
          `From: ${email.fromName} (${email.from})\n` +
          `Subject: ${email.subject}\n\n` +
          `⚠️ Auto-parsed from email — please review & update fields\n` +
          `🔗 https://crm.honorremovals.com.au/jobs`
        )
        results.push(`Created job ${createdJobNumber}`)
      } else if (aodAttachment) {
        const msg = attachedJobId
          ? `📎 <b>EFEX AOD PDF auto-attached</b>\n🔗 https://crm.honorremovals.com.au/jobs`
          : `📎 <b>EFEX AOD PDF received</b> — no matching job found. Attach manually.\n🔗 https://crm.honorremovals.com.au/jobs`
        await sendTelegram(msg)
        results.push(attachedJobId ? 'AOD attached' : 'AOD received (no match)')
      } else if (matchedClient) {
        const preview = email.body.slice(0, 200).replace(/\n+/g, ' ').trim()
        await sendTelegram(
          `📧 <b>Email from ${matchedClient.name}</b>\n` +
          `${email.subject}\n\n${preview}…\n\n` +
          `🔗 https://crm.honorremovals.com.au/jobs`
        )
        results.push('Email logged')
      }

      uidsToMark.push(email.uid)
      processedCount++
    }

    await markAsRead(uidsToMark)
    return NextResponse.json({ processed: processedCount, results })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('IMAP poll error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
