import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn, jobStatusColor, jobStatusLabel } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-[#2a2d3e] text-[#94a3b8]',
        orange: 'bg-orange-500/15 text-orange-400 border border-orange-500/30',
        blue: 'bg-blue-500/15 text-blue-400 border border-blue-500/30',
        green: 'bg-green-500/15 text-green-400 border border-green-500/30',
        amber: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
        red: 'bg-red-500/15 text-red-400 border border-red-500/30',
        purple: 'bg-purple-500/15 text-purple-400 border border-purple-500/30',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export function StatusBadge({ status }: { status: string }) {
  const colorClass = jobStatusColor(status)
  const label = jobStatusLabel(status)
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
        colorClass
      )}
    >
      {label}
    </span>
  )
}

export { Badge, badgeVariants }
