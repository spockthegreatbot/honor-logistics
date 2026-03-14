import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/require-auth'

// AUTO-ARCHIVE DISABLED: Jobs with past dates now show in "Today" view with Overdue badge.
// This endpoint is kept for backward compatibility but is a no-op.
export async function POST() {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  return NextResponse.json({ archived: 0, message: 'Auto-archive disabled — overdue jobs show in Today view' })
}
