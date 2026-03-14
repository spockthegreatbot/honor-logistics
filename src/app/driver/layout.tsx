import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Driver View | Honor Logistics',
  description: 'Today\'s jobs for drivers',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1',
}

export default function DriverLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0f1117] text-[#f1f5f9]">
      {children}
    </div>
  )
}
