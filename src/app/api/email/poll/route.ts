import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { fetchUnreadEmails, markAsRead } from '@/lib/imap'
import { parseBookingForm } from '@/lib/docx-parser'
import { parseAxusJobPdf } from '@/lib/axus-pdf-parser'
import { parseAxusEmailBody } from '@/lib/axus-body-parser'

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
async function createJobFromDocx(supabase: any, docxBuffer: Buffer, attachments: EmailAttachment[], subject: string = ''): Promise<{ jobId: string; jobNumber: string } | null> {
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

    // Use source job number: efexRef if available, else derive from email subject
    let jobNumber: string
    if (data.efexRef) {
      jobNumber = String(data.efexRef)
    } else {
      const efexSubjectM = subject.match(/Efex\s*\/\s*([^-]+?)\s*-\s*[^-]+?\s*-\s*(\d{2})-(\d{2})-(\d{4})/i)
      if (efexSubjectM) {
        const customer = efexSubjectM[1].trim().replace(/\s+/g, '')
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
        const monthStr = months[parseInt(efexSubjectM[3], 10) - 1] ?? efexSubjectM[3]
        jobNumber = `EFEX-${customer}-${efexSubjectM[2]}${monthStr}${efexSubjectM[4]}`
      } else {
        const normSubj = subject.replace(/[^a-zA-Z0-9]/g, '').slice(0, 20)
        jobNumber = normSubj ? `EFEX-${normSubj}` : `EFEX-${Date.now()}`
      }
    }

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
  const cronSecret = (process.env.CRON_SECRET ?? 'honor-cron-secret').trim()
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

      // ── 0. Axus email handling ────────────────────────────────────
      const isAxusEmail = email.from.toLowerCase() === 'support@axusgroup.com.au'
      const isThreadReply = /^(re:|fw:|fwd:)/i.test(email.subject.trim())

      // 0a. New Axus job booking (has "Job NoComment" PDF attachment)
      const axusJobPdf = email.attachments.find((a: EmailAttachment) =>
        a.filename.toLowerCase().startsWith('job nocomment') &&
        a.filename.toLowerCase().endsWith('.pdf')
      )

      if (isAxusEmail && axusJobPdf && !isThreadReply) {
        let axusData
        try {
          axusData = await parseAxusJobPdf((axusJobPdf as EmailAttachment).content)
        } catch (e) {
          console.error('Axus PDF parse error:', e)
          results.push(`Axus PDF parse failed: ${(e as Error).message}`)
          uidsToMark.push(email.uid)
          processedCount++
          continue
        }

        const clientRef = `AXUS-${axusData.axusJobNumber}`
        const { data: existing } = await supabase.from('jobs')
          .select('id, job_number').eq('client_reference', clientRef).maybeSingle()

        if (existing) {
          results.push(`Skipped duplicate ${clientRef} (exists as ${existing.job_number})`)
          uidsToMark.push(email.uid)
          processedCount++
          continue
        }

        // Get Axus client ID
        const { data: axusClient } = await supabase.from('clients')
          .select('id').ilike('name', '%axus%').limit(1).single()
        const axusClientId = axusClient?.id ?? null

        // Look up or create end_customer
        let endCustomerId: string | null = null
        if (axusClientId && axusData.shipToCode) {
          const firstName = axusData.shipToName.split(' ')[0]
          const { data: ec } = await supabase.from('end_customers')
            .select('id').eq('client_id', axusClientId)
            .ilike('name', `%${firstName}%`).limit(1).single()
          if (ec?.id) {
            endCustomerId = ec.id
          } else {
            const { data: newEc } = await supabase.from('end_customers').insert({
              name: axusData.shipToName,
              client_id: axusClientId,
              contact_name: axusData.shipToAttn || null,
              contact_phone: axusData.shipToPhone || null,
              address: axusData.shipToAddress || null,
            }).select('id').single()
            endCustomerId = newEc?.id ?? null
          }
        }

        const jobNumber = String(axusData.axusJobNumber)

        // Upload job PDF
        const bucket = 'job-documents'
        const jobPdfUrl = await uploadAttachment(
          supabase, bucket, 'axus-jobs',
          (axusJobPdf as EmailAttachment).filename,
          (axusJobPdf as EmailAttachment).content,
          'application/pdf'
        )

        // Upload EDI label PDF if present
        const ediLabelPdf = email.attachments.find((a: EmailAttachment) =>
          a.filename.toLowerCase().startsWith('edi labels') && a.contentType === 'application/pdf'
        )
        const labelUrl = ediLabelPdf
          ? await uploadAttachment(supabase, bucket, 'axus-labels',
              (ediLabelPdf as EmailAttachment).filename,
              (ediLabelPdf as EmailAttachment).content,
              'application/pdf')
          : null

        // Build notes
        const lineItemsSummary = axusData.lineItems.map(li => `${li.description} (${li.code}) x${li.qty}`).join(', ')
        const fullNotes = [
          axusData.fault || null,
          lineItemsSummary ? `Items: ${lineItemsSummary}` : null,
          labelUrl ? `EDI Label: ${labelUrl}` : null,
        ].filter(Boolean).join('\n')

        const { data: newJob, error: jobErr } = await supabase.from('jobs').insert({
          job_number: jobNumber,
          job_type: axusData.jobType || 'toner',
          order_types: [axusData.jobType || 'toner'],
          status: 'new',
          client_id: axusClientId,
          end_customer_id: endCustomerId,
          contact_name: axusData.shipToAttn || null,
          contact_phone: axusData.shipToPhone || null,
          scheduled_date: axusData.dateDue,
          address_to: axusData.shipToAddress || null,
          machine_model: axusData.machineModel || null,
          serial_number: axusData.serialNumber || null,
          notes: fullNotes || null,
          client_reference: clientRef,
          has_aod: false,
          booking_form_url: jobPdfUrl,
        }).select('id').single()

        if (jobErr) {
          console.error('Axus job create error:', jobErr)
          results.push(`${clientRef}: job create failed — ${jobErr.message}`)
        } else {
          const lineItemsMsg = axusData.lineItems.map(li => `${li.description} x${li.qty}`).join(', ')
          await sendTelegram(
            `🆕 <b>New AXUS Job — ${jobNumber}</b>\n` +
            `📋 Type: ${axusData.jobType.charAt(0).toUpperCase() + axusData.jobType.slice(1)}\n` +
            `👤 Customer: ${axusData.shipToName}\n` +
            `📍 Deliver To: ${axusData.shipToAddress}\n` +
            `🔧 Machine: ${axusData.machineModel} | S/N: ${axusData.serialNumber}\n` +
            `📦 Items: ${lineItemsMsg || 'See job card'}\n` +
            (axusData.dateDue ? `📅 Due: ${axusData.dateDue}\n` : '') +
            `🔗 https://crm.honorremovals.com.au/jobs`
          )
          results.push(`Created AXUS job ${jobNumber} (Axus Job# ${axusData.axusJobNumber})`)
          console.log(`Created AXUS job ${jobNumber} id=${newJob?.id}`)
        }

        // Log email
        await supabase.from('email_log').insert({
          direction: 'inbound', from_email: email.from, from_name: email.fromName,
          from_address: email.from, subject: email.subject, body_text: email.body,
          body_preview: email.body.slice(0, 500), received_at: email.receivedAt.toISOString(),
          client_id: axusClientId, ms_message_id: email.messageId, raw_message_id: email.messageId,
          status: 'received', processed: !jobErr,
        })

        uidsToMark.push(email.uid)
        processedCount++
        continue
      }

      // 0b. Axus email WITHOUT "Job NoComment" PDF — attempt body parsing
      if (isAxusEmail && !axusJobPdf && !isThreadReply) {
        const bodyData = parseAxusEmailBody(email.subject, email.body)

        if (bodyData && bodyData.axusJobNumber) {
          const clientRef = `AXUS-${bodyData.axusJobNumber}`
          const { data: existing } = await supabase.from('jobs')
            .select('id, job_number').eq('client_reference', clientRef).maybeSingle()

          if (existing) {
            results.push(`Skipped duplicate ${clientRef} (exists as ${existing.job_number})`)
          } else {
            // Get Axus client ID
            const { data: axusClient } = await supabase.from('clients')
              .select('id').ilike('name', '%axus%').limit(1).single()
            const axusClientId = axusClient?.id ?? null

            // Look up or create end_customer
            let endCustomerId: string | null = null
            if (axusClientId && bodyData.shipToName) {
              const firstName = bodyData.shipToName.split(' ')[0]
              const { data: ec } = await supabase.from('end_customers')
                .select('id').eq('client_id', axusClientId)
                .ilike('name', `%${firstName}%`).limit(1).single()
              if (ec?.id) {
                endCustomerId = ec.id
              } else {
                const { data: newEc } = await supabase.from('end_customers').insert({
                  name: bodyData.shipToName,
                  client_id: axusClientId,
                  contact_name: bodyData.shipToAttn || null,
                  contact_phone: bodyData.shipToPhone || null,
                  address: bodyData.shipToAddress || null,
                }).select('id').single()
                endCustomerId = newEc?.id ?? null
              }
            }

            const jobNumber = String(bodyData.axusJobNumber)

            const { data: newJob, error: jobErr } = await supabase.from('jobs').insert({
              job_number: jobNumber,
              job_type: bodyData.jobType ?? 'delivery',
              order_types: [bodyData.jobType ?? 'delivery'],
              status: 'new',
              client_id: axusClientId,
              end_customer_id: endCustomerId,
              contact_name: bodyData.shipToAttn || null,
              contact_phone: bodyData.shipToPhone || null,
              scheduled_date: bodyData.dateDue ?? null,
              address_to: bodyData.shipToAddress || null,
              machine_model: bodyData.machineModel || null,
              serial_number: bodyData.serialNumber || null,
              notes: `Auto-created from Axus email body (no PDF). Review & verify.`,
              client_reference: clientRef,
              has_aod: false,
            }).select('id').single()

            if (jobErr) {
              console.error('Axus body-parse job create error:', jobErr)
              results.push(`${clientRef}: body-parse job create failed — ${jobErr.message}`)
            } else {
              await sendTelegram(
                `🆕 <b>New AXUS Job (body-parsed) — ${jobNumber}</b>\n` +
                `📋 Type: ${(bodyData.jobType ?? 'delivery').charAt(0).toUpperCase() + (bodyData.jobType ?? 'delivery').slice(1)}\n` +
                `👤 Customer: ${bodyData.shipToName ?? 'Unknown'}\n` +
                `📍 Deliver To: ${bodyData.shipToAddress ?? 'N/A'}\n` +
                `🔧 Machine: ${bodyData.machineModel ?? 'N/A'} | S/N: ${bodyData.serialNumber ?? 'N/A'}\n` +
                (bodyData.dateDue ? `📅 Due: ${bodyData.dateDue}\n` : '') +
                `⚠️ Created from email body — verify details.\n` +
                `🔗 https://crm.honorremovals.com.au/jobs`
              )
              results.push(`Created AXUS job ${jobNumber} via body-parse (Axus Job# ${bodyData.axusJobNumber})`)
              console.log(`Created AXUS body-parse job ${jobNumber} id=${newJob?.id}`)
            }
          }
        } else {
          // Could not parse job number at all
          await sendTelegram(
            `📧 <b>Axus email received — could not auto-parse.</b> Review manually.\n` +
            `Subject: ${email.subject}\n` +
            `🔗 https://crm.honorremovals.com.au/jobs`
          )
          results.push('Axus email — no job number found, alert sent')
        }

        await supabase.from('email_log').insert({
          direction: 'inbound', from_email: email.from, from_name: email.fromName,
          from_address: email.from, subject: email.subject, body_text: email.body,
          body_preview: email.body.slice(0, 500), received_at: email.receivedAt.toISOString(),
          client_id: null, ms_message_id: email.messageId, raw_message_id: email.messageId,
          status: 'received', processed: true,
        })

        uidsToMark.push(email.uid)
        processedCount++
        continue
      }

      // 0c. Axus thread replies (RE:/FW:)
      if (isAxusEmail && isThreadReply) {
        const jobNumMatch = email.subject.match(/\[Axus_Group Job#(\d+)/)
        const axusJobNum = jobNumMatch?.[1]

        let existingJobNumber = 'unknown'
        if (axusJobNum) {
          const { data: existingJob } = await supabase.from('jobs')
            .select('id, job_number').eq('client_reference', `AXUS-${axusJobNum}`).maybeSingle()
          if (existingJob) {
            existingJobNumber = existingJob.job_number
            // Attach any new PDFs to notes
            const newPdfs = email.attachments.filter((a: EmailAttachment) => a.contentType === 'application/pdf')
            if (newPdfs.length > 0) {
              const uploadedUrls = await Promise.all(newPdfs.map((pdf: EmailAttachment) =>
                uploadAttachment(supabase, 'job-documents', 'axus-updates', pdf.filename, pdf.content, 'application/pdf')
              ))
              const urlList = uploadedUrls.filter(Boolean).join('\n')
              if (urlList) {
                const { data: existingJobData } = await supabase.from('jobs')
                  .select('notes').eq('id', existingJob.id).single()
                const updatedNotes = [existingJobData?.notes, `Update ${new Date().toISOString().slice(0, 10)}: ${urlList}`]
                  .filter(Boolean).join('\n')
                await supabase.from('jobs').update({ notes: updatedNotes }).eq('id', existingJob.id)
              }
            }
            await sendTelegram(`📎 <b>AXUS Job Update — ${existingJobNumber}</b>\nRe: ${email.subject}\n🔗 https://crm.honorremovals.com.au/jobs`)
          }
        }

        await supabase.from('email_log').insert({
          direction: 'inbound', from_email: email.from, from_name: email.fromName,
          from_address: email.from, subject: email.subject, body_text: email.body,
          body_preview: email.body.slice(0, 500), received_at: email.receivedAt.toISOString(),
          client_id: null, ms_message_id: email.messageId, raw_message_id: email.messageId,
          status: 'received', processed: true,
        })

        results.push(`Axus reply logged (job ${existingJobNumber})`)
        uidsToMark.push(email.uid)
        processedCount++
        continue
      }

      // ── 1. Check for EFEX booking form DOCX ──────────────────────
      const bookingDocx = email.attachments.find((a: EmailAttachment) =>
        a.filename.toLowerCase().startsWith('booking form') &&
        a.filename.toLowerCase().endsWith('.docx')
      )

      if (bookingDocx) {
        // This is an EFEX job booking — parse DOCX and create job
        const result = await createJobFromDocx(supabase, (bookingDocx as EmailAttachment).content, email.attachments, email.subject)

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
