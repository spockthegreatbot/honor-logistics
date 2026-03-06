'use client'

import { useState, useRef } from 'react'
import {
  Upload, FileSpreadsheet, CheckCircle2, AlertCircle,
  ChevronDown, ChevronUp, Info
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const IMPORT_SHEETS = [
  {
    id: 'runup',
    label: 'Run-Up Sheet',
    description: 'Machine run-up records',
    columns: ['week', 'date', 'fy', 'customer', 'model', 'serial', 'action_type', 'qty', 'price_ex', 'comments'],
    icon: '⚙️',
  },
  {
    id: 'delivery',
    label: 'Delivery & Collection',
    description: 'Delivery, collection, recycling jobs',
    columns: ['week', 'date', 'fy', 'customer', 'model', 'serial', 'action', 'qty', 'price_ex', 'total_inc_fuel', 'comments'],
    icon: '🚛',
  },
  {
    id: 'install',
    label: 'Install Sheet',
    description: 'Machine installation records',
    columns: ['week', 'date', 'fy', 'customer', 'model', 'serial', 'action', 'price_ex', 'fma_notes'],
    icon: '🔧',
  },
  {
    id: 'inwards',
    label: 'Inwards / Outwards',
    description: 'Warehouse inbound and outbound movements',
    columns: ['week', 'date', 'fy', 'action', 'qty', 'po_number', 'sender_name', 'product_code', 'serial_no', 'cost_ex', 'notes'],
    icon: '📦',
  },
  {
    id: 'toner',
    label: 'Toner Orders',
    description: 'Toner pack and ship records',
    columns: ['week', 'date', 'fy', 'courier', 'efex_ni', 'qty', 'price_ex', 'tracking_number'],
    icon: '🖨️',
  },
  {
    id: 'storage',
    label: 'Storage Weekly',
    description: 'Weekly storage billing records',
    columns: ['week', 'fy', 'storage_type', 'qty', 'cost_ex', 'total_ex'],
    icon: '🏭',
  },
  {
    id: 'soh',
    label: 'SOH Masterfile',
    description: 'Stock on hand — imports into inventory',
    columns: ['date_inwards', 'po_number', 'product_group', 'uom', 'product_code', 'brand', 'location', 'sender_name', 'description', 'serial_no', 'customer', 'notes'],
    icon: '📋',
  },
] as const

type SheetId = typeof IMPORT_SHEETS[number]['id']

interface ImportResult {
  status: 'idle' | 'uploading' | 'success' | 'error'
  message?: string
  imported?: number
  skipped?: number
  errors?: number
  errorDetails?: { row: number; reason: string }[]
}

export function CsvImportSection() {
  const [expanded, setExpanded] = useState(false)
  const [activeSheet, setActiveSheet] = useState<SheetId>('runup')
  const [states, setStates] = useState<Partial<Record<SheetId, ImportResult>>>({})
  const [previewData, setPreviewData] = useState<{ headers: string[]; rows: string[][] } | null>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [showErrors, setShowErrors] = useState(false)
  const fileRefs = useRef<Partial<Record<SheetId, HTMLInputElement | null>>>({})

  const setSheetState = (id: SheetId, state: ImportResult) => {
    setStates((prev) => ({ ...prev, [id]: state }))
  }

  function parseCSVPreview(text: string): { headers: string[]; rows: string[][] } {
    const lines = text.split(/\r?\n/).filter(l => l.trim())
    const headers = lines[0]?.split(',').map(h => h.trim().replace(/"/g, '')) ?? []
    const rows = lines.slice(1, 6).map(l => l.split(',').map(v => v.trim().replace(/"/g, '')))
    return { headers, rows }
  }

  function handleFileSelect(sheetId: SheetId, file: File | null) {
    if (!file) return
    if (!file.name.endsWith('.csv')) {
      setSheetState(sheetId, { status: 'error', message: 'Please upload a .csv file.' })
      return
    }
    // Show preview
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      setPreviewData(parseCSVPreview(text))
      setPendingFile(file)
      setSheetState(sheetId, { status: 'idle' })
    }
    reader.readAsText(file)
  }

  async function handleImport() {
    if (!pendingFile) return
    setSheetState(activeSheet, { status: 'uploading' })
    setShowErrors(false)

    const formData = new FormData()
    formData.append('file', pendingFile)

    try {
      const res = await fetch(`/api/import/${activeSheet}`, { method: 'POST', body: formData })
      const json = await res.json()

      if (res.ok) {
        setSheetState(activeSheet, {
          status: 'success',
          message: json.message,
          imported: json.imported,
          skipped: json.skipped,
          errors: json.errors,
          errorDetails: json.errorDetails,
        })
        setPreviewData(null)
        setPendingFile(null)
      } else {
        setSheetState(activeSheet, { status: 'error', message: json.error ?? 'Import failed.' })
      }
    } catch {
      setSheetState(activeSheet, { status: 'error', message: 'Network error — please try again.' })
    }
  }

  const activeSheetDef = IMPORT_SHEETS.find((s) => s.id === activeSheet)!
  const activeState = states[activeSheet] ?? { status: 'idle' }

  return (
    <Card>
      <CardHeader
        className="border-b border-[#2a2d3e] cursor-pointer select-none"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-[#94a3b8]" />
              Historical Data Import
            </CardTitle>
            <CardDescription className="mt-1">
              Import historical records from the 7 Excel sheets into the database. CSV format required.
            </CardDescription>
          </div>
          {expanded ? (
            <ChevronUp className="w-5 h-5 text-[#94a3b8] flex-shrink-0" />
          ) : (
            <ChevronDown className="w-5 h-5 text-[#94a3b8] flex-shrink-0" />
          )}
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="p-0">
          <div className="flex flex-col sm:flex-row min-h-[360px]">
            {/* Sheet selector */}
            <div className="sm:w-52 border-b sm:border-b-0 sm:border-r border-[#2a2d3e] bg-[#1a1d27] flex flex-row sm:flex-col overflow-x-auto sm:overflow-x-visible">
              {IMPORT_SHEETS.map((sheet) => {
                const state = states[sheet.id]
                return (
                  <button
                    key={sheet.id}
                    onClick={() => { setActiveSheet(sheet.id); setPreviewData(null); setPendingFile(null) }}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2.5 text-left text-sm font-medium transition-colors flex-shrink-0 sm:flex-shrink border-b border-[#2a2d3e] last:border-b-0',
                      activeSheet === sheet.id
                        ? 'bg-[#1e2130] text-[#f1f5f9] sm:border-r-2 sm:border-r-orange-500'
                        : 'text-[#94a3b8] hover:bg-[#1e2130] hover:text-[#f1f5f9]',
                    )}
                  >
                    <span className="text-base leading-none">{sheet.icon}</span>
                    <span className="hidden sm:inline truncate">{sheet.label}</span>
                    {state?.status === 'success' && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-500 ml-auto flex-shrink-0" />
                    )}
                    {state?.status === 'error' && (
                      <AlertCircle className="w-3.5 h-3.5 text-red-500 ml-auto flex-shrink-0" />
                    )}
                  </button>
                )
              })}
            </div>

            {/* Import panel */}
            <div className="flex-1 p-5 space-y-4">
              <div>
                <h3 className="font-semibold text-[#f1f5f9] flex items-center gap-2">
                  <span>{activeSheetDef.icon}</span>
                  {activeSheetDef.label}
                </h3>
                <p className="text-sm text-[#94a3b8] mt-0.5">{activeSheetDef.description}</p>
              </div>

              {/* Expected columns */}
              <div>
                <p className="text-xs font-medium text-[#94a3b8] uppercase tracking-wider mb-2">Expected CSV columns</p>
                <div className="flex flex-wrap gap-1.5">
                  {activeSheetDef.columns.map((col) => (
                    <span key={col} className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-[#2a2d3e] text-[#94a3b8] font-mono">
                      {col}
                    </span>
                  ))}
                </div>
              </div>

              {/* Success state */}
              {activeState.status === 'success' && (
                <div className="space-y-2">
                  <div className="flex items-start gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                    <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-green-400">Import Complete</p>
                      <div className="mt-1 flex flex-wrap gap-3 text-xs">
                        <span className="text-green-300">✓ {activeState.imported} imported</span>
                        {(activeState.skipped ?? 0) > 0 && <span className="text-[#94a3b8]">↷ {activeState.skipped} skipped</span>}
                        {(activeState.errors ?? 0) > 0 && <span className="text-red-400">✗ {activeState.errors} errors</span>}
                      </div>
                    </div>
                  </div>
                  {activeState.errorDetails && activeState.errorDetails.length > 0 && (
                    <div>
                      <button
                        onClick={() => setShowErrors(v => !v)}
                        className="text-xs text-[#94a3b8] hover:text-[#f1f5f9] flex items-center gap-1"
                      >
                        <Info className="w-3.5 h-3.5" />
                        {showErrors ? 'Hide' : 'Show'} error details ({activeState.errorDetails.length})
                      </button>
                      {showErrors && (
                        <div className="mt-2 max-h-40 overflow-y-auto rounded border border-[#2a2d3e] text-xs">
                          {activeState.errorDetails.map((e, i) => (
                            <div key={i} className="flex gap-2 px-3 py-1 border-b border-[#2a2d3e] last:border-0">
                              <span className="text-[#94a3b8]">Row {e.row}</span>
                              <span className="text-red-400">{e.reason}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <Button size="sm" variant="outline" onClick={() => { setSheetState(activeSheet, { status: 'idle' }); setPreviewData(null); setPendingFile(null) }}>
                    Import another file
                  </Button>
                </div>
              )}

              {/* Error state */}
              {activeState.status === 'error' && !previewData && (
                <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-red-400">Import failed</p>
                    <p className="text-xs text-[#94a3b8] mt-0.5">{activeState.message}</p>
                    <Button size="sm" variant="outline" className="mt-2" onClick={() => setSheetState(activeSheet, { status: 'idle' })}>Try again</Button>
                  </div>
                </div>
              )}

              {/* Preview table */}
              {previewData && activeState.status !== 'uploading' && (
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-medium text-[#94a3b8] uppercase tracking-wider mb-2">Preview (first 5 rows)</p>
                    <div className="overflow-x-auto rounded border border-[#2a2d3e]">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-[#2a2d3e] bg-[#1a1d27]">
                            {previewData.headers.map((h, i) => (
                              <th key={i} className="px-2 py-1.5 text-left text-[#94a3b8] font-medium whitespace-nowrap">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {previewData.rows.map((row, i) => (
                            <tr key={i} className="border-b border-[#2a2d3e] last:border-0">
                              {row.map((cell, j) => (
                                <td key={j} className="px-2 py-1.5 text-[#f1f5f9] whitespace-nowrap max-w-[120px] truncate">{cell}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-xs text-[#94a3b8] mt-1">File: {pendingFile?.name} · {Math.round((pendingFile?.size ?? 0) / 1024)} KB</p>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={handleImport}>
                      Import Now
                    </Button>
                    <Button variant="outline" onClick={() => { setPreviewData(null); setPendingFile(null) }}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {/* Upload zone — show when no preview and not success */}
              {!previewData && activeState.status !== 'success' && activeState.status !== 'uploading' && (
                <div
                  className={cn(
                    'border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer',
                    'border-[#2a2d3e] hover:border-orange-500/50 hover:bg-orange-500/5',
                  )}
                  onClick={() => fileRefs.current[activeSheet]?.click()}
                >
                  <input
                    ref={(el) => { fileRefs.current[activeSheet] = el }}
                    type="file"
                    accept=".csv"
                    className="sr-only"
                    onChange={(e) => handleFileSelect(activeSheet, e.target.files?.[0] ?? null)}
                  />
                  <Upload className="w-8 h-8 text-[#94a3b8] mx-auto mb-2" />
                  <p className="text-sm text-[#f1f5f9] font-medium">Drop CSV file here or click to browse</p>
                  <p className="text-xs text-[#94a3b8] mt-1">Export from Excel as CSV (UTF-8), header row required</p>
                </div>
              )}

              {/* Uploading */}
              {activeState.status === 'uploading' && (
                <div className="flex flex-col items-center gap-3 py-6">
                  <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm text-[#94a3b8]">Importing rows...</p>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  )
}
