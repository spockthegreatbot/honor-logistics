import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/require-auth'
import { BILLING_CLIENTS } from '@/lib/client-colors'

export async function GET() {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createClient()

  const now = new Date()
  const sevenDaysAgo = new Date(now)
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const sevenDaysAgoStr = sevenDaysAgo.toISOString()

  const doneStatuses = ['complete', 'done', 'delivered', 'invoiced']
  const openExclude = ['complete', 'done', 'delivered', 'invoiced', 'cancelled']

  // Fetch all non-toner, non-archived jobs with client info
  const { data: allJobs, error: jobsError } = await supabase
    .from('jobs')
    .select('id, status, scheduled_date, created_at, billing_cycle_id, job_type, archived, clients(id, name, color_code)')
    .neq('job_type', 'toner')

  if (jobsError) {
    return NextResponse.json({ error: jobsError.message }, { status: 500 })
  }

  const jobs = allJobs ?? []
  const activeJobs = jobs.filter(j => !j.archived)

  // Top-level stats
  let totalOpenJobs = 0
  let completedThisWeek = 0
  let unbilledAmount = 0
  let inTransitNow = 0
  let newJobsThisWeek = 0
  let totalUnbilledCount = 0

  // Per-client stats
  const clientStats: Record<string, {
    name: string
    color: string
    openJobs: number
    completedJobs: number
    totalJobs: number
    unbilledCount: number
    latestJobDate: string | null
  }> = {}

  // Initialize all billing clients
  for (const clientName of BILLING_CLIENTS) {
    clientStats[clientName] = {
      name: clientName,
      color: '',
      openJobs: 0,
      completedJobs: 0,
      totalJobs: 0,
      unbilledCount: 0,
      latestJobDate: null,
    }
  }

  for (const job of activeJobs) {
    const status = (job.status ?? 'new').toLowerCase()
    const cl = job.clients as unknown as { name: string; color_code?: string | null } | null
    const clientName = cl?.name
    const clientColor = cl?.color_code
    const createdAt = job.created_at as string | null
    const scheduledDate = job.scheduled_date as string | null

    // Open jobs
    if (!openExclude.includes(status)) {
      totalOpenJobs++
    }

    // In transit
    if (status === 'in_transit' || status === 'dispatched') {
      inTransitNow++
    }

    // Completed this week
    if (doneStatuses.includes(status) && createdAt && new Date(createdAt) >= sevenDaysAgo) {
      completedThisWeek++
    }

    // New jobs this week
    if (createdAt && new Date(createdAt) >= sevenDaysAgo) {
      newJobsThisWeek++
    }

    // Unbilled (no billing_cycle_id, status is done/complete/delivered)
    if (!job.billing_cycle_id && doneStatuses.includes(status) && status !== 'invoiced') {
      unbilledAmount++
    }

    // Total unbilled
    if (!job.billing_cycle_id && status !== 'cancelled') {
      totalUnbilledCount++
    }

    // Per-client
    if (clientName && clientStats[clientName]) {
      const cs = clientStats[clientName]
      if (clientColor) cs.color = clientColor
      cs.totalJobs++

      if (!openExclude.includes(status)) {
        cs.openJobs++
      }
      if (doneStatuses.includes(status)) {
        cs.completedJobs++
      }
      if (!job.billing_cycle_id && status !== 'cancelled') {
        cs.unbilledCount++
      }

      const jobDate = scheduledDate || createdAt
      if (jobDate && (!cs.latestJobDate || jobDate > cs.latestJobDate)) {
        cs.latestJobDate = jobDate
      }
    }
  }

  const res = NextResponse.json({
    summary: {
      totalOpenJobs,
      completedThisWeek,
      unbilledAmount,
      inTransitNow,
      newJobsThisWeek,
      totalUnbilledCount,
    },
    clients: Object.values(clientStats),
  })
  res.headers.set('Cache-Control', 'private, max-age=10')
  return res
}
