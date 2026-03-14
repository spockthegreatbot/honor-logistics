'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { Check } from 'lucide-react'

interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  onCheckedChange?: (checked: boolean) => void
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, checked, onCheckedChange, onChange, ...props }, ref) => {
    return (
      <label className="inline-flex items-center cursor-pointer">
        <input
          ref={ref}
          type="checkbox"
          className="sr-only peer"
          checked={checked}
          onChange={(e) => {
            onChange?.(e)
            onCheckedChange?.(e.target.checked)
          }}
          {...props}
        />
        <span
          className={cn(
            'h-4 w-4 shrink-0 rounded border border-[#4a4d5e] bg-transparent transition-colors',
            'flex items-center justify-center',
            'peer-checked:bg-orange-500 peer-checked:border-orange-500',
            'peer-focus-visible:ring-2 peer-focus-visible:ring-orange-500/50 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-[#0f1117]',
            'peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
            className
          )}
        >
          {checked && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
        </span>
      </label>
    )
  }
)
Checkbox.displayName = 'Checkbox'

export { Checkbox }
