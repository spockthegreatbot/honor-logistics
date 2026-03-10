import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import nodemailer from 'nodemailer'
import { requireAuth } from '@/lib/require-auth'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const transporter = nodemailer.createTransport({
  host: 'mail.honorremovals.com.au',
  port: 465,
  secure: true,
  auth: {
    user: 'automation@honorremovals.com.au',
    pass: process.env.HONOR_SMTP_PASSWORD ?? '0+9aS$V133hp',
  },
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id } = await params

    // Fetch job with both AOD fields
    const { data: job, error: jobError } = await supabaseAdmin
      .from('jobs')
      .select(`
        id, job_number, signed_aod_url, signed_aod_at, aod_pdf_url,
        clients(name),
        end_customers(name)
      `)
      .eq('id', id)
      .single()

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = job as any
    const signedAodUrl: string | null = raw.signed_aod_url ?? null
    const signedAodAt: string | null = raw.signed_aod_at ?? null
    const efexAodUrl: string | null = raw.aod_pdf_url ?? null

    if (!signedAodUrl && !efexAodUrl) {
      return NextResponse.json({ error: 'No AOD documents found — generate a customer signature or wait for EFEX to email the AOD' }, { status: 400 })
    }

    const clients = Array.isArray(raw.clients) ? (raw.clients[0] as { name: string } | undefined) ?? null : raw.clients as { name: string } | null
    const endCustomers = Array.isArray(raw.end_customers) ? (raw.end_customers[0] as { name: string } | undefined) ?? null : raw.end_customers as { name: string } | null
    const jobNum = job.job_number ?? id
    const customerName = endCustomers?.name ?? clients?.name ?? 'Customer'
    const dateStr = signedAodAt
      ? new Date(signedAodAt).toLocaleDateString('en-AU')
      : new Date().toLocaleDateString('en-AU')

    // Build attachments
    const attachments: nodemailer.SendMailOptions['attachments'] = []

    if (signedAodUrl) {
      const res = await fetch(signedAodUrl)
      if (!res.ok) return NextResponse.json({ error: 'Failed to retrieve customer-signed AOD PDF' }, { status: 500 })
      attachments.push({
        filename: `Signed-AOD-${jobNum}.pdf`,
        content: Buffer.from(await res.arrayBuffer()),
        contentType: 'application/pdf',
      })
    }

    if (efexAodUrl) {
      const res = await fetch(efexAodUrl)
      if (!res.ok) return NextResponse.json({ error: 'Failed to retrieve EFEX AOD PDF' }, { status: 500 })
      attachments.push({
        filename: `EFEX-AOD-${jobNum}.pdf`,
        content: Buffer.from(await res.arrayBuffer()),
        contentType: 'application/pdf',
      })
    }

    // Build body description of what's attached
    const attachedDesc = [
      signedAodUrl ? 'Customer Signature AOD' : null,
      efexAodUrl ? 'EFEX AOD' : null,
    ].filter(Boolean).join(' + ')

    await transporter.sendMail({
      from: '"Honor Logistics" <automation@honorremovals.com.au>',
      to: 'info@honorremovals.com.au',
      subject: `AOD – Job ${jobNum} – ${customerName} – ${dateStr}`,
      html: `
        <p>Hi Onur,</p>
        <p>Please find attached the <strong>Acknowledgment of Delivery</strong> documents for:</p>
        <ul>
          <li><strong>Job:</strong> ${jobNum}</li>
          <li><strong>Customer:</strong> ${endCustomers?.name ?? '—'}</li>
          <li><strong>Client:</strong> ${clients?.name ?? '—'}</li>
          <li><strong>Date:</strong> ${dateStr}</li>
        </ul>
        <p><strong>Attached:</strong> ${attachedDesc}</p>
        <p style="color:#888;font-size:12px;margin-top:24px;">Honor Removals &amp; Logistics | automation@honorremovals.com.au</p>
      `,
      attachments,
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('AOD send error:', err)
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
  }
}
