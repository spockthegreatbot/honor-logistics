'use client'

import { useState, useRef } from 'react'
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { getClientColor, BILLING_CLIENTS } from '@/lib/client-colors'

interface BillingCycle {
  id: string
  cycle_name: string | null
  period_start: string
  period_end: string
  status: string | null
}

interface BillingClient {
  id: string
  name: string
  color_code?: string | null
}

interface Props {
  billingCycles: BillingCycle[]
  billingClients?: BillingClient[]
}

interface ImportResult {
  cycle_name: string
  cycle_id: string
  auto_created_cycle: boolean
  total_jobs: number
  imported: {
    runup: number
    install: number
    delivery: number
    collection: number
    toner: number
    storage: number
    storage_total: number
    errors: number
  }
}

export function XlsxImportSection({ billingCycles, billingClients = [] }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [cycleId, setCycleId] = useState('')
  const [clientId, setClientId] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)

  function handleFile(f: File | null) {
    if (!f) return
    if (!f.name.endsWith('.xlsx')) { setError('Please upload an .xlsx file'); return }
    setFile(f)
    setError('')
    setResult(null)
  }

  async function handleImport() {
    if (!file) { setError('Please select an Excel file'); return }
    if (!clientId) { setError('Please select a billing client'); return }

    setLoading(true)
    setError('')
    setResult(null)

    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('cycle_id', cycleId)
      fd.append('client_id', clientId)

      const res = await fetch('/api/import/xlsx', { method: 'POST', body: fd })
      const json = await res.json()

      if (!res.ok) { setError(json.error || 'Import failed'); return }
      setResult(json)
      setFile(null)
      setCycleId('')
      if (fileRef.current) fileRef.current.value = ''
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  // Only show known billing clients in the dropdown
  const displayClients = billingClients.filter((c) =>
    BILLING_CLIENTS.includes(c.name as typeof BILLING_CLIENTS[number])
  )

  const selectedClient = displayClients.find((c) => c.id === clientId)
  const selectedColor = selectedClient
    ? getClientColor(selectedClient.name, selectedClient.color_code)
    : null

  return (
    <Card>
      <CardHeader className="border-b border-[#2a2d3e]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-lg">
            📁
          </div>
          <div>
            <CardTitle className="text-[#f1f5f9]">Import Weekly Excel</CardTitle>
            <CardDescription>
              Upload a full weekly Excel file (Run Ups, Install, Delivery, Toner) — all sheets imported at once.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-5 space-y-5">
        {/* Step 1: Select Billing Client (required) */}
        <div>
          <label className="block text-sm font-medium text-[#94a3b8] mb-2">
            1. Billing client <span className="text-red-400">*</span>
          </label>
          <div className="relative">
            <select
              value={clientId}
              onChange={(e) => {
                setClientId(e.target.value)
                setCycleId('') // reset cycle when client changes
              }}
              className="w-full bg-[#1a1d27] border border-[#2a2d3e] rounded-lg px-3 py-2 text-sm text-[#f1f5f9] focus:outline-none focus:ring-1 focus:ring-orange-500/50 appearance-none"
              style={
                selectedColor
                  ? { borderLeftColor: selectedColor, borderLeftWidth: '3px' }
                  : undefined
              }
            >
              <option value="">— Select billing client —</option>
              {displayClients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {selectedClient && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 pointer-events-none">
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: selectedColor ?? '#64748b' }}
                />
              </div>
            )}
          </div>
          {!clientId && (
            <p className="text-xs text-amber-400/80 mt-1.5">
              ⚠️ A billing client must be selected before importing.
            </p>
          )}
        </div>

        {/* Step 2: Select Billing Cycle (optional) */}
        <div>
          <label className="block text-sm font-medium text-[#94a3b8] mb-2">
            2. Billing cycle <span className="text-[#64748b] font-normal">(optional — auto-detected from Excel if left blank)</span>
          </label>
          <select
            value={cycleId}
            onChange={(e) => setCycleId(e.target.value)}
            disabled={!clientId}
            className={cn(
              'w-full bg-[#1a1d27] border border-[#2a2d3e] rounded-lg px-3 py-2 text-sm text-[#f1f5f9] focus:outline-none focus:ring-1 focus:ring-orange-500/50',
              !clientId && 'opacity-40 cursor-not-allowed'
            )}
          >
            <option value="">✨ Auto-detect from Excel (creates new cycle)</option>
            {billingCycles.map((c) => (
              <option key={c.id} value={c.id}>
                {c.cycle_name || c.id.slice(0, 8)} · {c.period_start} → {c.period_end} · {c.status}
              </option>
            ))}
          </select>
          {!cycleId && clientId && (
            <p className="text-xs text-[#64748b] mt-1.5">
              📅 Week labels + date range will be read from the Excel to name and date the cycle automatically.
            </p>
          )}
        </div>

        {/* Step 3: Upload File */}
        <div>
          <label className="block text-sm font-medium text-[#94a3b8] mb-2">
            3. Upload Excel file (.xlsx)
          </label>
          <div
            className={cn(
              'border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer',
              dragOver ? 'border-orange-400 bg-orange-500/5' : 'border-[#2a2d3e] hover:border-[#3a3d4e]',
              file ? 'border-green-500/40 bg-green-500/5' : ''
            )}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]) }}
          >
            {file ? (
              <div className="flex flex-col items-center gap-2">
                <FileSpreadsheet className="w-8 h-8 text-green-400" />
                <p className="text-sm font-medium text-[#f1f5f9]">{file.name}</p>
                <p className="text-xs text-[#94a3b8]">{(file.size / 1024 / 1024).toFixed(1)} MB · Ready to import</p>
                <button
                  className="text-xs text-[#94a3b8] hover:text-red-400 underline mt-1"
                  onClick={(e) => { e.stopPropagation(); setFile(null); if (fileRef.current) fileRef.current.value = '' }}
                >
                  Remove
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload className="w-8 h-8 text-[#94a3b8]" />
                <p className="text-sm font-medium text-[#f1f5f9]">Drop Excel file here or click to browse</p>
                <p className="text-xs text-[#94a3b8]">Supports: Week XX-XX.xlsx with standard Honor sheets</p>
              </div>
            )}
          </div>
          <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={(e) => handleFile(e.target.files?.[0] ?? null)} />
        </div>

        {/* What gets imported */}
        <div className="bg-[#1a1d27] rounded-lg p-4 grid grid-cols-3 sm:grid-cols-6 gap-3 text-center">
          {[['⚙️', 'Run Ups'], ['🔧', 'Install'], ['🚛', 'Delivery'], ['📦', 'Collection'], ['🖨️', 'Toner'], ['🏭', 'Storage']].map(([icon, label]) => (
            <div key={label} className="flex flex-col items-center gap-1">
              <span className="text-xl">{icon}</span>
              <span className="text-xs text-[#94a3b8]">{label}</span>
            </div>
          ))}
        </div>

        {/* Import button */}
        <Button
          onClick={handleImport}
          disabled={!file || !clientId || loading}
          className="w-full"
          size="lg"
        >
          {loading ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Importing all sheets...</>
          ) : (
            <><Upload className="w-4 h-4" /> Import All Sheets</>
          )}
        </Button>

        {/* Result */}
        {result && (
          <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" />
              <div>
                <span className="text-sm font-medium text-green-400">
                  Import complete — {result.total_jobs} jobs added to <strong>{result.cycle_name}</strong>
                </span>
                {result.auto_created_cycle && (
                  <p className="text-xs text-orange-400 mt-0.5">✨ New billing cycle created automatically from Excel data</p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center">
              {[
                ['⚙️', 'Run Ups', result.imported.runup],
                ['🔧', 'Install', result.imported.install],
                ['🚛', 'Delivery', result.imported.delivery],
                ['📦', 'Collection', result.imported.collection],
                ['🖨️', 'Toner', result.imported.toner],
                ['🏭', 'Storage', result.imported.storage],
              ].map(([icon, label, count]) => (
                <div key={String(label)} className="bg-[#1a1d27] rounded-lg py-2 px-3">
                  <div className="text-base">{icon}</div>
                  <div className="text-lg font-bold text-[#f1f5f9]">{count}</div>
                  <div className="text-xs text-[#94a3b8]">{label}</div>
                </div>
              ))}
            </div>
            {result.imported.errors > 0 && (
              <p className="text-xs text-amber-400">⚠️ {result.imported.errors} batches had errors — some rows may not have imported.</p>
            )}
            <p className="text-xs text-[#64748b]">
              Go to the billing cycle and hit <strong>Recalculate</strong> to update totals.
            </p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
