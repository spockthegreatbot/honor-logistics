'use client'

import { useState } from 'react'
import {
  startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  eachDayOfInterval, addWeeks, subWeeks, addMonths, subMonths,
  format, isToday, isSameDay, parseISO
} from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { JobSlideOver } from '../jobs/JobSlideOver'
import { jobTypeLabel } from '@/lib/utils'

interface Job {
  id: string
  job_number: string | null
  job_type: string
  status: string | null
  scheduled_date: string | null
  clients?: { name: string } | null
  end_customers?: { name: string } | null
}

const JOB_TYPE_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  runup:      { bg: 'bg-amber-500/20 border-amber-500/30',   text: 'text-amber-300', dot: 'bg-amber-400' },
  delivery:   { bg: 'bg-blue-500/20 border-blue-500/30',     text: 'text-blue-300',  dot: 'bg-blue-400' },
  collection: { bg: 'bg-purple-500/20 border-purple-500/30', text: 'text-purple-300',dot: 'bg-purple-400' },
  install:    { bg: 'bg-green-500/20 border-green-500/30',   text: 'text-green-300', dot: 'bg-green-400' },
  toner_ship: { bg: 'bg-orange-500/20 border-orange-500/30', text: 'text-orange-300',dot: 'bg-orange-400' },
  inwards:    { bg: 'bg-cyan-500/20 border-cyan-500/30',     text: 'text-cyan-300',  dot: 'bg-cyan-400' },
  outwards:   { bg: 'bg-cyan-500/20 border-cyan-500/30',     text: 'text-cyan-300',  dot: 'bg-cyan-400' },
  storage:    { bg: 'bg-slate-500/20 border-slate-500/30',   text: 'text-slate-300', dot: 'bg-slate-400' },
}

interface Props {
  jobs: Job[]
}

function JobBlock({ job, onClick }: { job: Job; onClick: () => void }) {
  const style = JOB_TYPE_STYLES[job.job_type] ?? {
    bg: 'bg-[#2a2d3e] border-[#363a52]', text: 'text-[#94a3b8]', dot: 'bg-[#94a3b8]'
  }
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick() }}
      className={`w-full text-left text-xs rounded border px-1.5 py-1 flex items-start gap-1.5 ${style.bg} ${style.text} hover:opacity-80 transition truncate group`}
    >
      <span className={`w-1.5 h-1.5 rounded-full mt-0.5 shrink-0 ${style.dot}`} />
      <span className="truncate">
        <span className="font-bold">#{String(job.job_number ?? job.id).slice(-6).toUpperCase()}</span>
        {' '}
        <span className="opacity-80">{job.clients?.name ?? jobTypeLabel(job.job_type)}</span>
      </span>
    </button>
  )
}

export function CalendarClient({ jobs }: Props) {
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week')
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)

  // Days for current view
  const days = viewMode === 'week'
    ? eachDayOfInterval({
        start: startOfWeek(currentDate, { weekStartsOn: 1 }),
        end: endOfWeek(currentDate, { weekStartsOn: 1 }),
      })
    : eachDayOfInterval({
        start: startOfMonth(currentDate),
        end: endOfMonth(currentDate),
      })

  function prev() {
    setCurrentDate((d) => viewMode === 'week' ? subWeeks(d, 1) : subMonths(d, 1))
  }
  function next() {
    setCurrentDate((d) => viewMode === 'week' ? addWeeks(d, 1) : addMonths(d, 1))
  }
  function goToday() { setCurrentDate(new Date()) }

  function jobsForDay(day: Date) {
    return jobs.filter((j) => {
      if (!j.scheduled_date) return false
      try {
        return isSameDay(parseISO(j.scheduled_date), day)
      } catch { return false }
    })
  }

  const periodLabel = viewMode === 'week'
    ? `${format(days[0], 'd MMM')} – ${format(days[days.length - 1], 'd MMM yyyy')}`
    : format(currentDate, 'MMMM yyyy')

  // For monthly view, fill leading/trailing days
  const monthDays = viewMode === 'month' ? (() => {
    const firstDay = days[0]
    const dow = firstDay.getDay() // 0=Sun
    const leadingCount = (dow + 6) % 7 // Mon-based offset
    const leading = Array.from({ length: leadingCount }, (_, i) => {
      const d = new Date(firstDay)
      d.setDate(firstDay.getDate() - leadingCount + i)
      return d
    })
    return [...leading, ...days]
  })() : days

  // ── Mobile list view (sm and below) ─────────────────────
  const mobileView = (
    <div className="p-4 space-y-4 lg:hidden">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-[#f1f5f9]">Calendar</h1>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={prev} className="h-8 w-8">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-xs font-semibold text-[#f1f5f9] min-w-[130px] text-center">{periodLabel}</span>
          <Button variant="ghost" size="icon" onClick={next} className="h-8 w-8">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={goToday} className="text-xs">Today</Button>
        <div className="flex items-center rounded-lg border border-[#2a2d3e] overflow-hidden">
          {(['week', 'month'] as const).map((m) => (
            <button key={m} onClick={() => setViewMode(m)}
              className={`px-3 py-1.5 text-xs font-medium transition capitalize ${viewMode === m ? 'bg-[#2a2d3e] text-[#f1f5f9]' : 'text-[#94a3b8]'}`}>
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Days as a vertical list */}
      <div className="space-y-3">
        {days.map((day) => {
          const dayJobs = jobsForDay(day)
          const isCurrentDay = isToday(day)
          return (
            <div key={day.toISOString()} className={`rounded-xl border ${isCurrentDay ? 'border-orange-500/40 bg-orange-500/5' : 'border-[#2a2d3e] bg-[#1e2130]'}`}>
              <div className={`px-3 py-2 border-b border-[#2a2d3e] flex items-center gap-2`}>
                <span className={`text-sm font-bold ${isCurrentDay ? 'text-orange-400' : 'text-[#f1f5f9]'}`}>
                  {format(day, 'EEE')}
                </span>
                <span className={`text-xs ${isCurrentDay ? 'text-orange-300' : 'text-[#94a3b8]'}`}>
                  {format(day, 'd MMM')}
                </span>
                {isCurrentDay && <span className="ml-auto text-xs text-orange-400 font-medium">Today</span>}
                {dayJobs.length > 0 && (
                  <span className="ml-auto text-xs text-[#94a3b8]">{dayJobs.length} job{dayJobs.length > 1 ? 's' : ''}</span>
                )}
              </div>
              {dayJobs.length > 0 ? (
                <div className="p-2 space-y-1.5">
                  {dayJobs.map((job) => {
                    const style = JOB_TYPE_STYLES[job.job_type] ?? { bg: 'bg-[#2a2d3e] border-[#363a52]', text: 'text-[#94a3b8]', dot: 'bg-[#94a3b8]' }
                    return (
                      <button key={job.id} onClick={() => setSelectedJobId(job.id)}
                        className={`w-full text-left rounded-lg border px-3 py-2 flex items-center gap-2 ${style.bg} ${style.text} hover:opacity-80 transition`}>
                        <span className={`w-2 h-2 rounded-full shrink-0 ${style.dot}`} />
                        <span className="text-xs font-bold">#{String(job.job_number ?? job.id).slice(-6).toUpperCase()}</span>
                        <span className="text-xs opacity-80 flex-1 truncate">{job.clients?.name ?? jobTypeLabel(job.job_type)}</span>
                      </button>
                    )
                  })}
                </div>
              ) : (
                <p className="px-3 py-2 text-xs text-[#94a3b8]/40">No jobs</p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )

  return (
    <>
    <div className="p-6 space-y-5 hidden lg:block">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-[#f1f5f9]">Calendar</h1>

        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center rounded-lg border border-[#2a2d3e] overflow-hidden">
            <button
              onClick={() => setViewMode('week')}
              className={`px-3 py-1.5 text-xs font-medium transition ${
                viewMode === 'week'
                  ? 'bg-[#2a2d3e] text-[#f1f5f9]'
                  : 'text-[#94a3b8] hover:text-[#f1f5f9]'
              }`}
            >
              Week
            </button>
            <button
              onClick={() => setViewMode('month')}
              className={`px-3 py-1.5 text-xs font-medium transition ${
                viewMode === 'month'
                  ? 'bg-[#2a2d3e] text-[#f1f5f9]'
                  : 'text-[#94a3b8] hover:text-[#f1f5f9]'
              }`}
            >
              Month
            </button>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={prev} className="h-8 w-8">
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="text-sm font-semibold text-[#f1f5f9] min-w-[200px] text-center">
          {periodLabel}
        </span>
        <Button variant="ghost" size="icon" onClick={next} className="h-8 w-8">
          <ChevronRight className="w-4 h-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={goToday} className="ml-2">
          Today
        </Button>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 flex-wrap text-xs text-[#94a3b8]">
        {Object.entries(JOB_TYPE_STYLES).map(([type, style]) => (
          <span key={type} className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${style.dot}`} />
            {jobTypeLabel(type)}
          </span>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="rounded-xl border border-[#2a2d3e] overflow-hidden">
        {/* Day headers */}
        <div className={`grid border-b border-[#2a2d3e] bg-[#1a1d27] ${viewMode === 'week' ? 'grid-cols-7' : 'grid-cols-7'}`}>
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
            <div key={d} className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-[#94a3b8] text-center">
              {d}
            </div>
          ))}
        </div>

        {/* Days grid */}
        {viewMode === 'week' ? (
          <div className="grid grid-cols-7 min-h-[400px]">
            {days.map((day, idx) => {
              const dayJobs = jobsForDay(day)
              const isCurrentDay = isToday(day)
              return (
                <div
                  key={day.toISOString()}
                  className={`min-h-[120px] p-2 border-r last:border-r-0 border-[#2a2d3e] ${
                    isCurrentDay ? 'bg-orange-500/5' : 'bg-[#1e2130]'
                  }`}
                >
                  <div className={`text-sm font-semibold mb-2 w-7 h-7 flex items-center justify-center rounded-full ${
                    isCurrentDay
                      ? 'bg-orange-500 text-white'
                      : 'text-[#94a3b8]'
                  }`}>
                    {format(day, 'd')}
                  </div>
                  <div className="space-y-1">
                    {dayJobs.map((job) => (
                      <JobBlock
                        key={job.id}
                        job={job}
                        onClick={() => setSelectedJobId(job.id)}
                      />
                    ))}
                    {dayJobs.length === 0 && (
                      <span className="text-xs text-[#94a3b8]/30">—</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          // Monthly grid
          <div className="grid grid-cols-7">
            {monthDays.map((day, idx) => {
              const dayJobs = jobsForDay(day)
              const isCurrentDay = isToday(day)
              const isCurrentMonth = day.getMonth() === currentDate.getMonth()
              return (
                <div
                  key={`${day.toISOString()}-${idx}`}
                  className={`min-h-[100px] p-2 border-r border-b border-[#2a2d3e] ${
                    !isCurrentMonth ? 'bg-[#0f1117]/50 opacity-40' :
                    isCurrentDay ? 'bg-orange-500/5' : 'bg-[#1e2130]'
                  }`}
                >
                  <div className={`text-xs font-semibold mb-1 w-6 h-6 flex items-center justify-center rounded-full ${
                    isCurrentDay
                      ? 'bg-orange-500 text-white'
                      : 'text-[#94a3b8]'
                  }`}>
                    {format(day, 'd')}
                  </div>
                  <div className="space-y-0.5">
                    {dayJobs.slice(0, 3).map((job) => (
                      <JobBlock
                        key={job.id}
                        job={job}
                        onClick={() => setSelectedJobId(job.id)}
                      />
                    ))}
                    {dayJobs.length > 3 && (
                      <span className="text-xs text-[#94a3b8] pl-1">+{dayJobs.length - 3} more</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* No jobs empty state */}
      {jobs.length === 0 && (
        <div className="text-center py-8 text-[#94a3b8]">
          <p className="font-medium">No scheduled jobs yet</p>
          <p className="text-sm mt-1 text-[#94a3b8]/60">Jobs with a scheduled date will appear on the calendar</p>
        </div>
      )}

      {/* Job Detail Slide-Over */}
      {selectedJobId && (
        <JobSlideOver
          jobId={selectedJobId}
          onClose={() => setSelectedJobId(null)}
        />
      )}
    </div>

    {/* Mobile view */}
    {mobileView}
    </>
  )
}
