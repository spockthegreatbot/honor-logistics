import { createClient } from '@/lib/supabase/server'

function escapeCsv(val: string | null | undefined): string {
  if (val == null) return ''
  const s = String(val)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export async function GET() {
  const supabase = await createClient()

  const { data: jobs } = await supabase
    .from('jobs')
    .select('*, clients(name), end_customers(name), staff:assigned_to(name)')
    .order('created_at', { ascending: false })

  const header = 'Job Number,Type,Status,Scheduled Date,Client,Customer,Assigned To,Notes'
  const rows = (jobs ?? []).map((j) => {
    const client = (j as { clients?: { name: string } | null }).clients?.name
    const customer = (j as { end_customers?: { name: string } | null }).end_customers?.name
    const staff = (j as { staff?: { name: string } | null }).staff?.name
    return [
      j.job_number, j.job_type, j.status, j.scheduled_date,
      client, customer, staff, j.notes,
    ].map(escapeCsv).join(',')
  })

  const csv = [header, ...rows].join('\n')

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="honor-jobs.csv"',
    },
  })
}
