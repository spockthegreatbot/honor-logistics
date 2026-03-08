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

    // Fetch job with AOD info
    const { data: job, error: jobError } = await supabaseAdmin
      .from('jobs')
      .select(`
        id, job_number, aod_pdf_url, aod_signed_at,
        clients(name),
        end_customers(name)
      `)
      .eq('id', id)
      .single()

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    if (!job.aod_pdf_url) {
      return NextResponse.json({ error: 'No AOD generated yet — generate signature first' }, { status: 400 })
    }

    // Download PDF from URL
    const pdfResponse = await fetch(job.aod_pdf_url)
    if (!pdfResponse.ok) {
      return NextResponse.json({ error: 'Failed to retrieve AOD PDF' }, { status: 500 })
    }
    const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer())

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = job as any
    const clients = Array.isArray(raw.clients) ? (raw.clients[0] as { name: string } | undefined) ?? null : raw.clients as { name: string } | null
    const endCustomers = Array.isArray(raw.end_customers) ? (raw.end_customers[0] as { name: string } | undefined) ?? null : raw.end_customers as { name: string } | null
    const dateStr = job.aod_signed_at
      ? new Date(job.aod_signed_at).toLocaleDateString('en-AU')
      : new Date().toLocaleDateString('en-AU')
    const jobNum = job.job_number ?? id

    // Send email to Onur
    await transporter.sendMail({
      from: '"Honor Logistics" <automation@honorremovals.com.au>',
      to: 'info@honorremovals.com.au',
      subject: `AOD – Job ${jobNum} – ${endCustomers?.name ?? clients?.name ?? 'Customer'} – ${dateStr}`,
      html: `
        <p>Hi Onur,</p>
        <p>Please find attached the signed <strong>Acknowledgment of Delivery</strong> for:</p>
        <ul>
          <li><strong>Job:</strong> ${jobNum}</li>
          <li><strong>Customer:</strong> ${endCustomers?.name ?? '—'}</li>
          <li><strong>Client:</strong> ${clients?.name ?? '—'}</li>
          <li><strong>Signed:</strong> ${dateStr}</li>
        </ul>
        <p>Review and forward to EFEX when ready.</p>
        <p style="color:#888;font-size:12px;margin-top:24px;">Honor Removals &amp; Logistics | automation@honorremovals.com.au</p>
      `,
      attachments: [
        {
          filename: `AOD-${jobNum}-${dateStr.replace(/\//g, '-')}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('AOD send error:', err)
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
  }
}
