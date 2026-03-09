import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { fetchUnreadEmails, markAsRead } from '@/lib/imap'
import { parseBookingForm } from '@/lib/docx-parser'

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

// ── Job matching (for AOD attachment) ────────────────────────────────────────

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

// ── Upload helper ────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function uploadAttachment(supabase: any, bucket: string, folder: string, filename: string, content: Buffer, contentType: string): Promise<string | null> {
  const timestamp = Date.now()
  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_')
  const storagePath = `${folder}/${timestamp}_${safeFilename}`

  await supabase.storage.createBucket(bucket, { public: false, fileSizeLimit: 20971520 }).catch(() => {})

  const { error: uploadErr } = await supabase.storage
    .from(bucket)
    .upload(storagePath, content, { contentType, upsert: false })

  if (uploadErr) {
    console.error(`Upload error (${folder}/${filename}):`, uploadErr.message)
    return null
  }

  const { data: signedUrl } = await supabase.storage
    .from(bucket)
    .createSignedUrl(storagePath, 60 * 60 * 24 * 365)

  return signedUrl?.signedUrl ?? null
}

// ── Job creation from DOCX ──────────────────────────────────────────────────

interface EmailAttachment {
  filename: string
  contentType: string
  content: Buffer
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createJobFromDocx(supabase: any, docxBuffer: Buffer, attachments: EmailAttachment[]): Promise<{ jobId: string; jobNumber: string } | null> {
  try {
    const data = await parseBookingForm(docxBuffer)

    // Get EFEX client ID
    const { data: efexClient } = await supabase
      .from('clients')
      .select('id')
      .ilike('name', '%efex%')
      .limit(1)
      .single()

    const clientId = efexClient?.id ?? null

    // Look up or create end_customer
    let endCustomerId: string | null = null
    if (data.customer && clientId) {
      const { data: ec } = await supabase
        .from('end_customers')
        .select('id')
        .ilike('name', `%${data.customer.split(' ')[0]}%`)
        .eq('client_id', clientId)
        .limit(1)
        .single()

      if (ec?.id) {
        endCustomerId = ec.id
      } else {
        // Create new end_customer
        const { data: newEc } = await supabase
          .from('end_customers')
          .insert({
            name: data.customer,
            client_id: clientId,
            contact_name: data.contactName,
            contact_phone: data.contactPhone,
            address: data.address,
          })
          .select('id')
          .single()
        endCustomerId = newEc?.id ?? null
      }
    }

    // Parse date DD-MM-YYYY → YYYY-MM-DD
    let scheduledDate: string | null = null
    if (data.deliveryDate) {
      const dm = data.deliveryDate.match(/(\d{2})-(\d{2})-(\d{4})/)
      if (dm) scheduledDate = `${dm[3]}-${dm[2]}-${dm[1]}`
    }

    // Generate job number: HRL-YYYY-XXXX using MAX sequence
    const year = new Date().getFullYear()
    const { data: maxJob } = await supabase
      .from('jobs')
      .select('job_number')
      .ilike('job_number', `HRL-${year}-%`)
      .order('job_number', { ascending: false })
      .limit(1)
      .single()

    let seq = 1
    if (maxJob?.job_number) {
      const lastSeq = parseInt(maxJob.job_number.split('-')[2], 10)
      if (!isNaN(lastSeq)) seq = lastSeq + 1
    }
    const jobNumber = `HRL-${year}-${String(seq).padStart(4, '0')}`

    const jobType = data.orderTypes[0] ?? 'delivery'

    // Upload attachments
    const bucket = 'job-documents'

    // Find booking form DOCX
    const bookingDocx = attachments.find(a => a.filename.toLowerCase().startsWith('booking form') && a.filename.toLowerCase().endsWith('.docx'))
    const bookingFormUrl = bookingDocx
      ? await uploadAttachment(supabase, bucket, 'booking-forms', bookingDocx.filename, bookingDocx.content, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
      : null

    // Find AOD PDF
    const aodPdf = attachments.find(a =>
      a.contentType === 'application/pdf' &&
      (a.filename.toLowerCase().includes('aod') || a.filename.toLowerCase().includes('acknowledgment'))
    )
    const aodPdfUrl = aodPdf
      ? await uploadAttachment(supabase, bucket, 'aod', aodPdf.filename, aodPdf.content, 'application/pdf')
      : null

    // Find install PDF
    const installPdf = attachments.find(a =>
      a.contentType === 'application/pdf' &&
      (a.filename.toLowerCase().includes('install') || a.filename.toLowerCase().includes('printer'))
    )
    const installPdfUrl = installPdf
      ? await uploadAttachment(supabase, bucket, 'install-pdfs', installPdf.filename, installPdf.content, 'application/pdf')
      : null

    // Build insert object — only include columns that exist
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const insertObj: Record<string, any> = {
      job_number: jobNumber,
      job_type: jobType,
      order_types: data.orderTypes,
      status: 'new',
      client_id: clientId,
      end_customer_id: endCustomerId,
      contact_name: data.contactName,
      contact_phone: data.contactPhone,
      scheduled_date: scheduledDate,
      scheduled_time: data.timeConstraint,
      serial_number: data.serialNumber,
      machine_model: data.machineModel,
      machine_accessories: data.machineAccessories,
      install_idca: data.installIdca,
      address_to: data.address,
      stair_walker: data.stairWalker,
      stair_walker_comment: data.stairWalkerComment,
      parking: data.parking,
      parking_comment: data.parkingComment,
      pickup_model: data.pickupModel,
      pickup_accessories: data.pickupAccessories,
      pickup_serial: data.pickupSerial,
      pickup_disposition: data.pickupDisposal,
      special_instructions: data.specialInstructions,
      has_aod: !!aodPdfUrl,
      aod_pdf_url: aodPdfUrl,
      booking_form_url: bookingFormUrl,
      install_pdf_url: installPdfUrl,
      notes: `Auto-created from EFEX booking form DOCX.`,
    }

    const { data: newJob, error } = await supabase.from('jobs').insert(insertObj).select('id').single()

    if (error) {
      // If columns don't exist yet, retry without them
      if (error.code === '42703') {
        console.warn('Some columns missing, retrying insert without new columns:', error.message)
        delete insertObj.machine_model
        delete insertObj.booking_form_url
        delete insertObj.install_pdf_url
        const { data: retryJob, error: retryErr } = await supabase.from('jobs').insert(insertObj).select('id').single()
        if (retryErr) {
          console.error('Job create retry error:', retryErr)
          return null
        }
        return retryJob ? { jobId: retryJob.id, jobNumber } : null
      }
      console.error('Job create error:', error)
      return null
    }

    return newJob ? { jobId: newJob.id, jobNumber } : null
  } catch (e) {
    console.error('createJobFromDocx error:', e)
    return null
  }
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

      // ── 1. Check for EFEX booking form DOCX ──────────────────────
      const bookingDocx = email.attachments.find((a: EmailAttachment) =>
        a.filename.toLowerCase().startsWith('booking form') &&
        a.filename.toLowerCase().endsWith('.docx')
      )

      if (bookingDocx) {
        // This is an EFEX job booking — parse DOCX and create job
        const result = await createJobFromDocx(supabase, (bookingDocx as EmailAttachment).content, email.attachments)

        if (result) {
          const data = await parseBookingForm((bookingDocx as EmailAttachment).content)
          const typeLabel = data.orderTypes.map((t: string) => ({
            delivery: 'Delivery',
            installation: 'Installation',
            pickup: 'Pick-Up',
          }[t] ?? t)).join(' + ') || 'Delivery'

          await sendTelegram(
            `🆕 <b>New EFEX Job Created — ${result.jobNumber}</b>\n` +
            `📋 Type: ${typeLabel}\n` +
            `👤 Customer: ${data.customer ?? 'Unknown'}\n` +
            `📍 Address: ${data.address ?? 'N/A'}\n` +
            `🔧 Machine: ${data.machineModel ?? 'N/A'} | S/N: ${data.serialNumber ?? 'N/A'}\n` +
            `📅 Date: ${data.deliveryDate ?? 'N/A'}\n` +
            `🔗 https://crm.honorremovals.com.au/jobs`
          )
          results.push(`Created job ${result.jobNumber}`)
        } else {
          results.push('DOCX parse failed')
        }

        // Log email
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
          processed: result !== null,
        })

        uidsToMark.push(email.uid)
        processedCount++
        continue
      }

      // ── 2. Check for AOD PDF (attach to existing job) ────────────
      const aodAttachment = email.attachments.find((a: EmailAttachment) =>
        a.contentType === 'application/pdf' &&
        (a.filename.toLowerCase().includes('aod') ||
         a.filename.toLowerCase().includes('acknowledgment') ||
         a.filename.toLowerCase().includes('delivery'))
      )

      let aodStorageUrl: string | null = null
      let attachedJobId: string | null = null

      if (aodAttachment) {
        aodStorageUrl = await uploadAttachment(
          supabase, 'aod-documents', 'efex-aod',
          (aodAttachment as EmailAttachment).filename,
          (aodAttachment as EmailAttachment).content,
          'application/pdf'
        )

        if (aodStorageUrl) {
          attachedJobId = await findMatchingJob(supabase, email.from, email.subject, email.body)
          if (attachedJobId) {
            await supabase.from('jobs').update({
              aod_pdf_url: aodStorageUrl,
              has_aod: true,
              updated_at: new Date().toISOString(),
            }).eq('id', attachedJobId)
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
        processed: attachedJobId !== null,
      })

      // ── 4. Telegram alert ─────────────────────────────────────────
      if (aodAttachment) {
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
