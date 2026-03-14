import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/require-auth'

export async function GET() {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createClient()

  // Single query: fetch all non-archived, non-toner jobs with minimal fields
  const { data: jobs, error } = await supabase
    .from('jobs')
    .select('id, status, scheduled_date, archived, billing_cycle_id, job_type')
    .neq('job_type', 'toner')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)

  const addDays = (d: Date, n: number) => {
    const r = new Date(d)
    r.setDate(r.getDate() + n)
    return r.toISOString().slice(0, 10)
  }

  const tomorrowStr = addDays(now, 1)
  const grace2 = addDays(now, -2)
  const weekEnd = addDays(now, 7)
  const nwStart = addDays(now, 8)
  const nwEnd = addDays(now, 14)

  const doneStatuses = new Set(['complete', 'done', 'invoiced', 'cancelled'])
  const completedStatuses = new Set(['done', 'delivered', 'complete'])
  const todayExclude = new Set(['complete', 'done', 'invoiced', 'cancelled'])
  const tomorrowExclude = new Set(['complete', 'invoiced', 'cancelled'])

  const counts = {
    today: 0,
    tomorrow: 0,
    week: 0,
    next_week: 0,
    unscheduled: 0,
    ready_to_bill: 0,
    archived: 0,
  }

  for (const job of jobs ?? []) {
    const s = job.status ?? 'new'
    const sd = job.scheduled_date as string | null
    const archived = job.archived as boolean
    const billingCycleId = job.billing_cycle_id as string | null
    const jobType = job.job_type as string

    // Archived count
    if (archived) {
      counts.archived++
    }

    // Ready to bill: unbilled non-toner jobs (any status except cancelled)
    if (!billingCycleId && s !== 'cancelled' && jobType !== 'toner') {
      counts.ready_to_bill++
    }

    // Skip archived for remaining scopes
    if (archived) continue

    // Today: scheduled in grace window OR in_transit, not done
    if (!todayExclude.has(s)) {
      if (s === 'in_transit' && sd && sd <= todayStr) {
        counts.today++
      } else if (sd && sd >= grace2 && sd <= todayStr) {
        counts.today++
      }
    }

    // Tomorrow
    if (!tomorrowExclude.has(s) && sd === tomorrowStr) {
      counts.tomorrow++
    }

    // This week (tomorrow+1 through +7)
    if (!tomorrowExclude.has(s) && sd && sd >= tomorrowStr && sd <= weekEnd) {
      counts.week++
    }

    // Next week (+8 through +14)
    if (!tomorrowExclude.has(s) && sd && sd >= nwStart && sd <= nwEnd) {
      counts.next_week++
    }

    // Unscheduled: no date, not done, not archived, exclude runups
    if (!sd && !doneStatuses.has(s) && jobType !== 'runup') {
      counts.unscheduled++
    }
  }

  // Cap archived at 50 to match the existing behavior
  if (counts.archived > 50) counts.archived = 50

  const res = NextResponse.json(counts)
  res.headers.set('Cache-Control', 'private, max-age=5')
  return res
}
