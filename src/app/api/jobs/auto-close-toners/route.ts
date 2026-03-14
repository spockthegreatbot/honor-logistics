import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const CRON_SECRET = process.env.CRON_SECRET ?? 'honor-auto-open-2026'

export async function POST(request: NextRequest) {
  // Auth: either cron secret or user session
  const cronHeader = request.headers.get('x-cron-secret')
  if (cronHeader !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'Missing Supabase config' }, { status: 500 })
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  // Find toner jobs with status 'dispatched' older than 3 days
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 3)
  const cutoffStr = cutoff.toISOString()

  const { data: tonerJobs, error: fetchErr } = await supabase
    .from('jobs')
    .select('id, job_number, status, created_at, scheduled_date')
    .eq('job_type', 'toner')
    .eq('status', 'dispatched')
    .lt('created_at', cutoffStr)

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  }

  if (!tonerJobs || tonerJobs.length === 0) {
    return NextResponse.json({ closed: 0, message: 'No toner orders to auto-close' })
  }

  const ids = tonerJobs.map(j => j.id)

  const { error: updateErr } = await supabase
    .from('jobs')
    .update({ status: 'done', updated_at: new Date().toISOString() })
    .in('id', ids)

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  console.log(`[auto-close-toners] Closed ${ids.length} toner orders: ${tonerJobs.map(j => j.job_number).join(', ')}`)

  return NextResponse.json({
    closed: ids.length,
    jobs: tonerJobs.map(j => j.job_number),
  })
}
