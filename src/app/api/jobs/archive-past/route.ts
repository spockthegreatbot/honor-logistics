import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/require-auth'

const DONE_STATUSES = ['done', 'complete', 'completed', 'invoiced', 'cancelled']

export async function POST() {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createClient()

  const now = new Date()
  // 2-day grace window: archive jobs older than today - 2 days
  const cutoff = new Date(now)
  cutoff.setDate(cutoff.getDate() - 2)
  const cutoffStr = cutoff.toISOString().slice(0, 10) // YYYY-MM-DD

  // 1) Archive old unfinished jobs (past grace window)
  const { data: oldJobs, error: oldErr } = await supabase
    .from('jobs')
    .update({ archived: true })
    .lt('scheduled_date', cutoffStr)
    .eq('archived', false)
    .not('status', 'in', `(${DONE_STATUSES.join(',')})`)
    .select('id')

  // 2) Archive done/invoiced/cancelled jobs with any past date immediately
  const todayStr = now.toISOString().slice(0, 10)
  const { data: doneJobs, error: doneErr } = await supabase
    .from('jobs')
    .update({ archived: true })
    .lt('scheduled_date', todayStr)
    .eq('archived', false)
    .in('status', DONE_STATUSES)
    .select('id')

  if (oldErr || doneErr) {
    console.error('[archive-past] error:', oldErr || doneErr)
    return NextResponse.json({ error: (oldErr || doneErr)!.message }, { status: 500 })
  }

  return NextResponse.json({
    archived: (oldJobs?.length ?? 0) + (doneJobs?.length ?? 0),
  })
}
