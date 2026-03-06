'use client'

import { useState, useRef } from 'react'
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const IMPORT_SHEETS = [
  {
    id: 'runup',
    label: 'Run-Up Sheet',
    description: 'Machine run-up records with checklist data',
    columns: ['Date', 'Machine Type', 'Serial #', 'Client', 'End Customer', 'Action', 'Price', 'Notes'],
    icon: '⚙️',
  },
  {
    id: 'delivery',
    label: 'Delivery & Collection',
    description: 'Delivery, collection, recycling, and swap jobs',
    columns: ['Date', 'Subtype', 'From Address', 'To Address', 'Client', 'Driver', 'Base Price', 'Fuel Override', 'Notes'],
    icon: '🚛',
  },
  {
    id: 'install',
    label: 'Install Sheet',
    description: 'Machine installation records',
    columns: ['Date', 'Machine Type', 'Serial #', 'Client', 'End Customer', 'PaperCut', 'FMA', 'Price', 'Notes'],
    icon: '🔧',
  },
  {
    id: 'inwards',
    label: 'Inwards / Outwards',
    description: 'Warehouse inbound and outbound movements',
    columns: ['Date', 'Type', 'PO #', 'Sender', 'Receiver', 'Product Code', 'Serial #', 'Qty', 'Location', 'Condition'],
    icon: '📦',
  },
  {
    id: 'toner',
    label: 'Toner Orders',
    description: 'Toner pack and ship records',
    columns: ['Date', 'NI #', 'Courier', 'Tracking', 'Weight (kg)', 'Dispatch Date', 'Est. Delivery', 'Total'],
    icon: '🖨️',
  },
  {
    id: 'storage',
    label: 'Storage Weekly',
    description: 'Weekly storage billing records',
    columns: ['Week', 'Storage Type', 'Qty', 'Cost Ex', 'Total Ex', 'Billing Cycle', 'Notes'],
    icon: '🏭',
  },
  {
    id: 'billing',
    label: 'Billing Cycles',
    description: 'Historical billing cycle summaries',
    columns: ['Cycle Name', 'Client', 'Period Start', 'Period End', 'FY', 'Status', 'Grand Total', 'Invoice #'],
    icon: '🧾',
  },
] as const

type SheetId = typeof IMPORT_SHEETS[number]['id']

interface ImportState {
  status: 'idle' | 'uploading' | 'success' | 'error'
  message?: string
  rowsImported?: number
}

export function CsvImportSection() {
  const [expanded, setExpanded] = useState(false)
  const [activeSheet, setActiveSheet] = useState<SheetId>('runup')
  const [states, setStates] = useState<Partial<Record<SheetId, ImportState>>>({})
  const fileRefs = useRef<Partial<Record<SheetId, HTMLInputElement | null>>>({})

  const setSheetState = (id: SheetId, state: ImportState) => {
    setStates((prev) => ({ ...prev, [id]: state }))
  }

  const handleFileChange = async (sheetId: SheetId, file: File | null) => {
    if (!file) return

    if (!file.name.endsWith('.csv')) {
      setSheetState(sheetId, { status: 'error', message: 'Please upload a .csv file.' })
      return
    }

    setSheetState(sheetId, { status: 'uploading' })

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch(`/api/import/${sheetId}`, {
        method: 'POST',
        body: formData,
      })
      const json = await res.json()

      if (res.ok) {
        setSheetState(sheetId, {
          status: 'success',
          message: json.message ?? 'Import queued successfully.',
          rowsImported: json.rows,
        })
      } else {
        setSheetState(sheetId, {
          status: 'error',
          message: json.error ?? 'Import failed. Check file format.',
        })
      }
    } catch {
      setSheetState(sheetId, { status: 'error', message: 'Network error — please try again.' })
    }
  }

  const activeSheetDef = IMPORT_SHEETS.find((s) => s.id === activeSheet)!
  const activeState = states[activeSheet] ?? { status: 'idle' }

  return (
    <Card>
      <CardHeader
        className="border-b border-slate-100 cursor-pointer select-none"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-slate-500" />
              Historical Data Import
            </CardTitle>
            <CardDescription className="mt-1">
              Import historical records from the 7 Excel sheets. CSV format required.
            </CardDescription>
          </div>
          {expanded ? (
            <ChevronUp className="w-5 h-5 text-slate-400 flex-shrink-0" />
          ) : (
            <ChevronDown className="w-5 h-5 text-slate-400 flex-shrink-0" />
          )}
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="p-0">
          <div className="flex flex-col sm:flex-row min-h-[320px]">
            {/* Sheet selector sidebar */}
            <div className="sm:w-48 border-b sm:border-b-0 sm:border-r border-slate-100 bg-slate-50 flex flex-row sm:flex-col overflow-x-auto sm:overflow-x-visible">
              {IMPORT_SHEETS.map((sheet) => {
                const state = states[sheet.id]
                return (
                  <button
                    key={sheet.id}
                    onClick={() => setActiveSheet(sheet.id)}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2.5 text-left text-sm font-medium transition-colors flex-shrink-0 sm:flex-shrink border-b border-slate-100 last:border-b-0',
                      activeSheet === sheet.id
                        ? 'bg-white text-slate-900 sm:border-r-2 sm:border-r-orange-500'
                        : 'text-slate-600 hover:bg-white hover:text-slate-900',
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
                <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                  <span>{activeSheetDef.icon}</span>
                  {activeSheetDef.label}
                </h3>
                <p className="text-sm text-slate-500 mt-0.5">{activeSheetDef.description}</p>
              </div>

              {/* Expected columns */}
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
                  Expected CSV columns
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {activeSheetDef.columns.map((col) => (
                    <span
                      key={col}
                      className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-700 font-mono"
                    >
                      {col}
                    </span>
                  ))}
                </div>
              </div>

              {/* Drop zone */}
              <div
                className={cn(
                  'border-2 border-dashed rounded-xl p-6 text-center transition-colors',
                  activeState.status === 'uploading'
                    ? 'border-orange-300 bg-orange-50'
                    : activeState.status === 'success'
                    ? 'border-green-300 bg-green-50'
                    : activeState.status === 'error'
                    ? 'border-red-300 bg-red-50'
                    : 'border-slate-200 hover:border-orange-300 hover:bg-orange-50 cursor-pointer',
                )}
                onClick={() => fileRefs.current[activeSheet]?.click()}
              >
                <input
                  ref={(el) => { fileRefs.current[activeSheet] = el }}
                  type="file"
                  accept=".csv"
                  className="sr-only"
                  onChange={(e) => handleFileChange(activeSheet, e.target.files?.[0] ?? null)}
                />

                {activeState.status === 'uploading' && (
                  <div className="space-y-2">
                    <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto" />
                    <p className="text-sm text-orange-700 font-medium">Uploading...</p>
                  </div>
                )}

                {activeState.status === 'success' && (
                  <div className="space-y-2">
                    <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto" />
                    <p className="text-sm text-green-700 font-medium">{activeState.message}</p>
                    {activeState.rowsImported != null && (
                      <p className="text-xs text-green-600">{activeState.rowsImported} rows queued for import</p>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation()
                        setSheetState(activeSheet, { status: 'idle' })
                      }}
                      className="mt-1"
                    >
                      Import another file
                    </Button>
                  </div>
                )}

                {activeState.status === 'error' && (
                  <div className="space-y-2">
                    <AlertCircle className="w-8 h-8 text-red-500 mx-auto" />
                    <p className="text-sm text-red-700 font-medium">{activeState.message}</p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation()
                        setSheetState(activeSheet, { status: 'idle' })
                      }}
                      className="mt-1"
                    >
                      Try again
                    </Button>
                  </div>
                )}

                {activeState.status === 'idle' && (
                  <div className="space-y-2">
                    <Upload className="w-8 h-8 text-slate-400 mx-auto" />
                    <p className="text-sm text-slate-700 font-medium">
                      Drop CSV file here or click to browse
                    </p>
                    <p className="text-xs text-slate-400">
                      Export from Excel as CSV (UTF-8), header row required
                    </p>
                  </div>
                )}
              </div>

              {/* Notice */}
              <p className="text-xs text-slate-400 flex items-start gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                Import runs in the background and validates each row. Errors are flagged for manual review.
                Full importer logic will be wired up in Phase 2.
              </p>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  )
}
