'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
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
  const containerRef = useRef<HTMLDivElement>(null)
  const [hasSignature, setHasSignature] = useState(false)

  // Resize canvas pixel dimensions to match container — fixes blank/wrong-size canvas on mobile
  const resizeCanvas = useCallback(() => {
    const canvas = sigRef.current?.getCanvas()
    const container = containerRef.current
    if (!canvas || !container) return
    const { width, height } = container.getBoundingClientRect()
    if (width < 10 || height < 10) return
    canvas.width = width
    canvas.height = height
    // Re-draw if there was content (clear is fine on resize for simplicity)
    const ctx = canvas.getContext('2d')
    if (ctx) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height) }
  }, [])

  useEffect(() => {
    if (!isOpen) return
    setHasSignature(false)
    const t = setTimeout(resizeCanvas, 120)
    window.addEventListener('resize', resizeCanvas)
    return () => { clearTimeout(t); window.removeEventListener('resize', resizeCanvas) }
  }, [isOpen, resizeCanvas])

  if (!isOpen) return null

  const handleClear = () => {
    sigRef.current?.clear()
    resizeCanvas()
    setHasSignature(false)
  }

  const handleConfirm = () => {
    // Always check isEmpty() directly on the ref — more reliable than state on mobile
    if (!sigRef.current || sigRef.current.isEmpty()) {
      return
    }
    const dataUrl = sigRef.current.getTrimmedCanvas().toDataURL('image/png')
    onConfirm(dataUrl)
  }

  return (
    // NOTE: NO touchAction:'none' on outer container — it blocks button taps
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
          Ask the customer to sign in the white box below, then tap Confirm.
        </p>
      </div>

      {/* Signature area — touchAction:none ONLY on the canvas wrapper to prevent scroll-while-drawing */}
      <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
        <div
          ref={containerRef}
          className="w-full rounded-2xl overflow-hidden bg-white border-2 border-dashed border-[#2a2d3e]"
          style={{ height: '100%', maxHeight: 400, touchAction: 'none' }}
        >
          <SignatureCanvas
            ref={sigRef}
            penColor="#1a1a2e"
            minWidth={1.5}
            maxWidth={3.5}
            velocityFilterWeight={0.7}
            canvasProps={{ style: { width: '100%', height: '100%', display: 'block' } }}
            onBegin={() => setHasSignature(true)}
            onEnd={() => {
              // Double-check via ref — most reliable on mobile
              setHasSignature(!(sigRef.current?.isEmpty() ?? true))
            }}
          />
        </div>
      </div>

      {/* Footer — touchAction is default (auto) so buttons get tapped */}
      <div className="px-4 py-4 border-t border-[#2a2d3e] flex items-center gap-3 shrink-0 bg-[#0f1117]">
        <Button variant="outline" size="sm" onClick={handleClear} className="flex items-center gap-2">
          <RotateCcw className="w-4 h-4" />
          Clear
        </Button>
        <Button
          size="sm"
          onClick={handleConfirm}
          className="flex-1 flex items-center justify-center gap-2 py-3 text-base"
        >
          <CheckCircle2 className="w-5 h-5" />
          Confirm &amp; Generate AOD
        </Button>
      </div>
    </div>
  )
}
