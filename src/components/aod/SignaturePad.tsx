'use client'

import { useRef, useState } from 'react'
import SignatureCanvas from 'react-signature-canvas'
import { X, RotateCcw, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface SignaturePadProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (signatureDataUrl: string) => void
  jobNumber: string | null
}

export function SignaturePad({ isOpen, onClose, onConfirm, jobNumber }: SignaturePadProps) {
  const sigRef = useRef<SignatureCanvas>(null)
  const [isEmpty, setIsEmpty] = useState(true)

  if (!isOpen) return null

  const handleClear = () => {
    sigRef.current?.clear()
    setIsEmpty(true)
  }

  const handleConfirm = () => {
    if (!sigRef.current || isEmpty) return
    const dataUrl = sigRef.current.getTrimmedCanvas().toDataURL('image/png')
    onConfirm(dataUrl)
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0f1117]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-[#2a2d3e] shrink-0">
        <div>
          <p className="text-sm font-semibold text-[#f1f5f9]">Customer Signature</p>
          {jobNumber && <p className="text-xs text-[#94a3b8]">{jobNumber}</p>}
        </div>
        <button onClick={onClose} className="p-2 rounded-lg text-[#94a3b8] hover:text-white hover:bg-[#2a2d3e]">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Instructions */}
      <div className="px-4 py-3 bg-[#1e2130] border-b border-[#2a2d3e] shrink-0">
        <p className="text-xs text-[#94a3b8] text-center">
          Hand the device to the customer. Ask them to sign in the box below.
        </p>
      </div>

      {/* Signature area */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-lg border-2 border-dashed border-[#2a2d3e] rounded-2xl overflow-hidden bg-white" style={{ height: '55vmax', maxHeight: 380 }}>
          <SignatureCanvas
            ref={sigRef}
            penColor="#1a1a2e"
            canvasProps={{ className: 'w-full h-full', style: { width: '100%', height: '100%' } }}
            onBegin={() => setIsEmpty(false)}
          />
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-[#2a2d3e] flex items-center gap-3 shrink-0">
        <Button variant="outline" size="sm" onClick={handleClear} className="flex items-center gap-2">
          <RotateCcw className="w-4 h-4" />
          Clear
        </Button>
        <Button
          size="sm"
          onClick={handleConfirm}
          disabled={isEmpty}
          className="flex-1 flex items-center justify-center gap-2"
        >
          <CheckCircle2 className="w-4 h-4" />
          Confirm Signature &amp; Generate AOD
        </Button>
      </div>
    </div>
  )
}
