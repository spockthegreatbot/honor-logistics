import { cn } from '@/lib/utils'

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-slate-100', className)}
      {...props}
    />
  )
}

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5">
      <div className="flex items-center justify-between mb-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-9 w-9 rounded-lg" />
      </div>
      <Skeleton className="h-8 w-16 mt-1" />
    </div>
  )
}

function SkeletonRow() {
  return (
    <tr className="border-b border-slate-100">
      {Array.from({ length: 5 }).map((_, i) => (
        <td key={i} className="py-3 px-4">
          <Skeleton className={`h-4 ${i === 0 ? 'w-20' : i === 4 ? 'w-16' : 'w-28'}`} />
        </td>
      ))}
    </tr>
  )
}

function SkeletonTable() {
  return (
    <div className="w-full overflow-auto">
      <table className="w-full text-sm">
        <tbody>
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

export { Skeleton, SkeletonCard, SkeletonRow, SkeletonTable }
