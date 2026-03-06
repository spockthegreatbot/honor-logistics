'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Receipt } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface Client { id: string; name: string }

function getFY(date: string): string {
  const d = new Date(date)
  const year = d.getFullYear()
  const month = d.getMonth() + 1
  return month >= 7 ? `${year}-${year + 1}` : `${year - 1}-${year}`
}

export default function NewBillingCycleClient({ clients }: { clients: Client[] }) {
  const router = useRouter()
  const [form, setForm] = useState({
    client_id: '',
    cycle_name: '',
    period_start: '',
    period_end: '',
    financial_year: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Auto-generate cycle name and FY when dates change
  function handleDateChange(field: 'period_start' | 'period_end', value: string) {
    const next = { ...form, [field]: value }
    if (next.period_start && next.period_end) {
      const fy = getFY(next.period_start)
      next.financial_year = fy
      // Auto-generate cycle name if not manually set
      if (!form.cycle_name || form.cycle_name.startsWith('Week')) {
        const start = new Date(next.period_start)
        const end = new Date(next.period_end)
        const weekStart = getWeekNumber(start)
        const weekEnd = getWeekNumber(end)
        const fyShort = fy.slice(2, 4) + fy.slice(7, 9)
        next.cycle_name = weekStart === weekEnd
          ? `Week ${weekStart} FY${fyShort}`
          : `Week ${weekStart}-${weekEnd} FY${fyShort}`
      }
    }
    setForm(next)
  }

  function getWeekNumber(d: Date): number {
    const onejan = new Date(d.getFullYear(), 0, 1)
    return Math.ceil((((d.getTime() - onejan.getTime()) / 86400000) + onejan.getDay() + 1) / 7)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.client_id || !form.period_start || !form.period_end) {
      setError('Client, period start and end are required.')
      return
    }
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error || 'Failed to create cycle'); return }
      router.push(`/billing/${json.data.id}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/billing" className="text-[#94a3b8] hover:text-[#f1f5f9] transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-[#f1f5f9]">New Billing Cycle</h1>
          <p className="text-sm text-[#94a3b8]">Create a new billing cycle for a client.</p>
        </div>
      </div>

      <Card>
        <CardHeader className="border-b border-[#2a2d3e]">
          <CardTitle className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-orange-400" />
            Cycle Details
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{error}</p>}

            <div>
              <Label>Client *</Label>
              <Select value={form.client_id || 'none'} onValueChange={v => setForm(f => ({ ...f, client_id: v === 'none' ? '' : v }))}>
                <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Select client —</SelectItem>
                  {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Period Start *</Label>
                <Input type="date" value={form.period_start} onChange={e => handleDateChange('period_start', e.target.value)} required />
              </div>
              <div>
                <Label>Period End *</Label>
                <Input type="date" value={form.period_end} onChange={e => handleDateChange('period_end', e.target.value)} required />
              </div>
            </div>

            <div>
              <Label>Cycle Name</Label>
              <Input
                value={form.cycle_name}
                onChange={e => setForm(f => ({ ...f, cycle_name: e.target.value }))}
                placeholder="e.g. Week 31-32 FY25-26"
              />
              <p className="text-xs text-[#94a3b8] mt-1">Auto-generated from dates. You can override.</p>
            </div>

            <div>
              <Label>Financial Year</Label>
              <Input value={form.financial_year} readOnly className="opacity-60" placeholder="Auto-detected from period start" />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" asChild>
                <Link href="/billing">Cancel</Link>
              </Button>
              <Button type="submit" disabled={saving || !form.client_id}>
                {saving ? 'Creating...' : 'Create Billing Cycle'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
