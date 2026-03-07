'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { RefreshCw, Mail, Building2 } from 'lucide-react'

interface EmailLog {
  id: string
  direction: string
  from_address: string
  subject: string
  body_preview: string
  received_at: string
  status: string
  client_id: string | null
  clients?: { name: string } | null
}

export default function EmailsPage() {
  const [emails, setEmails] = useState<EmailLog[]>([])
  const [loading, setLoading] = useState(true)
  const [polling, setPolling] = useState(false)
  const [selected, setSelected] = useState<EmailLog | null>(null)

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  async function loadEmails() {
    setLoading(true)
    const { data } = await supabase
      .from('email_log')
      .select('*, clients(name)')
      .eq('direction', 'inbound')
      .order('received_at', { ascending: false })
      .limit(100)
    setEmails(data ?? [])
    setLoading(false)
  }

  async function triggerPoll() {
    setPolling(true)
    try {
      const res = await fetch('/api/email/poll', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET ?? 'honor-cron-secret'}` },
      })
      const result = await res.json()
      if (result.processed > 0) {
        await loadEmails()
      }
      alert(result.processed > 0 ? `Fetched ${result.processed} new email(s)` : 'No new emails')
    } catch {
      alert('Poll failed — check server logs')
    } finally {
      setPolling(false)
    }
  }

  useEffect(() => { loadEmails() }, [])

  return (
    <div className="flex h-full gap-4 p-6">
      {/* List */}
      <div className="flex flex-col w-96 shrink-0">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <Mail className="h-5 w-5" /> Inbox
          </h1>
          <Button size="sm" variant="default" onClick={triggerPoll} disabled={polling}>
            <RefreshCw className={`h-4 w-4 mr-1 ${polling ? 'animate-spin' : ''}`} />
            {polling ? 'Fetching…' : 'Check Mail'}
          </Button>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : emails.length === 0 ? (
          <p className="text-sm text-muted-foreground">No emails yet. Hit Check Mail.</p>
        ) : (
          <div className="flex flex-col gap-1 overflow-y-auto">
            {emails.map(e => (
              <button
                key={e.id}
                onClick={() => setSelected(e)}
                className={`text-left p-3 rounded-lg border transition-colors ${
                  selected?.id === e.id
                    ? 'bg-primary/10 border-primary'
                    : 'hover:bg-muted border-transparent'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-sm font-medium truncate">{e.from_address}</span>
                  {e.clients?.name && (
                    <Badge variant="default" className="text-xs shrink-0">
                      {e.clients.name}
                    </Badge>
                  )}
                </div>
                <p className="text-sm font-medium truncate">{e.subject}</p>
                <p className="text-xs text-muted-foreground truncate mt-0.5">{e.body_preview}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {new Date(e.received_at).toLocaleString('en-AU', { timeZone: 'Australia/Sydney' })}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Detail */}
      <div className="flex-1 border rounded-lg p-6 overflow-y-auto">
        {selected ? (
          <div>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-xl font-semibold mb-1">{selected.subject}</h2>
                <p className="text-sm text-muted-foreground">From: {selected.from_address}</p>
                <p className="text-sm text-muted-foreground">
                  {new Date(selected.received_at).toLocaleString('en-AU', { timeZone: 'Australia/Sydney' })}
                </p>
              </div>
              {selected.clients?.name && (
                <Badge className="flex items-center gap-1">
                  <Building2 className="h-3 w-3" />
                  {selected.clients.name}
                </Badge>
              )}
            </div>
            <div className="border-t pt-4 whitespace-pre-wrap text-sm leading-relaxed">
              {selected.body_preview}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            Select an email to read
          </div>
        )}
      </div>
    </div>
  )
}
