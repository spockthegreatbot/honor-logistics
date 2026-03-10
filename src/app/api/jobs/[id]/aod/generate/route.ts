import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/require-auth'
import { generateAODPdf } from '@/lib/aod/generateAODPdf'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id } = await params
    const { signatureDataUrl } = await request.json() as { signatureDataUrl: string }

    if (!signatureDataUrl || !signatureDataUrl.startsWith('data:image/')) {
      return NextResponse.json({ error: 'Invalid signature data' }, { status: 400 })
    }

    // Fetch full job data — simple select, no risky joins
    const { data: job, error: jobError } = await supabaseAdmin
      .from('jobs')
      .select(`
        id, job_number, job_type, status, serial_number, scheduled_date,
        notes, completed_at, assigned_to, address_to, machine_model,
        clients(name),
        end_customers(name, address)
      `)
      .eq('id', id)
      .single()

    if (jobError || !job) {
      return NextResponse.json({ error: `Job not found: ${jobError?.message}` }, { status: 404 })
    }

    // Build job data for PDF
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = job as any
    const clients = Array.isArray(raw.clients) ? (raw.clients[0] as { name: string } | undefined) ?? null : raw.clients as { name: string } | null
    const endCustomers = Array.isArray(raw.end_customers) ? (raw.end_customers[0] as { name: string; address: string | null } | undefined) ?? null : raw.end_customers as { name: string; address: string | null } | null

    const jobData = {
      jobNumber: job.job_number,
      jobType: job.job_type,
      clientName: clients?.name ?? null,
      endCustomerName: endCustomers?.name ?? null,
      deliveryAddress: raw.address_to ?? endCustomers?.address ?? null,
      machineMake: null,
      machineModel: raw.machine_model ?? null,
      serialNumber: job.serial_number,
      staffName: null,
      completedAt: job.completed_at ?? null,
      scheduledDate: job.scheduled_date,
      notes: job.notes,
    }

    // Generate PDF
    const pdfBuffer = await generateAODPdf(jobData, signatureDataUrl)

    // Ensure Supabase Storage bucket exists
    const bucketId = 'aod-documents'
    const { error: bucketError } = await supabaseAdmin.storage.createBucket(bucketId, {
      public: false,
      fileSizeLimit: 10485760, // 10MB
    })
    // Ignore "already exists" error
    if (bucketError && !bucketError.message.includes('already exists')) {
      console.error('Bucket create error:', bucketError)
    }

    // Upload PDF
    const timestamp = Date.now()
    const filePath = `aod/${id}/${timestamp}.pdf`
    const { error: uploadError } = await supabaseAdmin.storage
      .from(bucketId)
      .upload(filePath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      })

    if (uploadError) {
      console.error('Storage upload error:', uploadError)
      return NextResponse.json({ error: 'Failed to upload PDF' }, { status: 500 })
    }

    // Create signed URL (valid 1 year)
    const { data: signedUrlData } = await supabaseAdmin.storage
      .from(bucketId)
      .createSignedUrl(filePath, 60 * 60 * 24 * 365)

    const aodUrl = signedUrlData?.signedUrl ?? filePath

    // Save to job record
    const { error: updateError } = await supabaseAdmin
      .from('jobs')
      .update({
        signed_aod_url: aodUrl,
        signed_aod_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (updateError) {
      console.error('Job update error:', updateError)
      return NextResponse.json({ error: 'Failed to save AOD to job' }, { status: 500 })
    }

    return NextResponse.json({ success: true, aodUrl })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('AOD generate error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
