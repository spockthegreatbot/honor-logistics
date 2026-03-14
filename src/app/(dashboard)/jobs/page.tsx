import { Suspense } from 'react'
import { ScheduleBoard } from './ScheduleBoard'

export const dynamic = 'force-dynamic'

export default function JobsPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 space-y-5">
          <div className="h-8 w-48 bg-[#2a2d3e] rounded-lg animate-pulse" />
          <div className="h-64 bg-[#1e2130] rounded-xl animate-pulse" />
        </div>
      }
    >
      <ScheduleBoard />
    </Suspense>
  )
}
