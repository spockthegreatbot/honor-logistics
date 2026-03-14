import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/require-auth'

export async function POST(request: NextRequest) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const supabase = await createClient()
    const { jobIds } = (await request.json()) as { jobIds: string[] }

    if (!jobIds || !Array.isArray(jobIds) || jobIds.length === 0) {
      return NextResponse.json({ error: 'jobIds array is required' }, { status: 400 })
    }

    // Fetch jobs to get their client_ids
    const { data: jobs, error: fetchError } = await supabase
      .from('jobs')
      .select('id, client_id, status')
      .in('id', jobIds)

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    if (!jobs || jobs.length === 0) {
      return NextResponse.json({ error: 'No jobs found' }, { status: 404 })
    }

    // Group jobs by client_id
    const clientJobMap = new Map<string, string[]>()
    for (const job of jobs) {
      if (!job.client_id) continue
      const existing = clientJobMap.get(job.client_id) || []
      existing.push(job.id)
      clientJobMap.set(job.client_id, existing)
    }

    // Check if jobs span multiple clients
    const clientIds = Array.from(clientJobMap.keys())
    if (clientIds.length > 1) {
      return NextResponse.json(
        { error: 'Selected jobs span multiple clients. Please select jobs from one client at a time.', clientIds },
        { status: 400 }
      )
    }

    const clientId = clientIds[0]
    if (!clientId) {
      return NextResponse.json({ error: 'Jobs have no client assigned' }, { status: 400 })
    }

    // Update all jobs to invoiced status
    const { error: updateError } = await supabase
      .from('jobs')
      .update({ status: 'invoiced' })
      .in('id', jobIds)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // Find or note the open billing cycle for this client
    const { data: openCycle } = await supabase
      .from('billing_cycles')
      .select('id')
      .eq('client_id', clientId)
      .eq('status', 'open')
      .order('period_start', { ascending: false })
      .limit(1)
      .maybeSingle()

    return NextResponse.json({
      success: true,
      updated: jobIds.length,
      client_id: clientId,
      billing_cycle_id: openCycle?.id ?? null,
    })
  } catch (err) {
    console.error('POST /api/jobs/bulk-invoice error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
