import { PDFDocument, rgb } from 'pdf-lib'
import fs from 'fs'
import path from 'path'

export interface AODJobData {
  jobNumber: string | null
  clientName: string | null
  endCustomerName: string | null
  deliveryAddress: string | null
  machineModel: string | null
  serialNumber: string | null
  scheduledDate: string | null
  notes: string | null
  efexAodUrl?: string | null  // EFEX-sent AOD from email (preferred base)
}

// Strip control characters — WinAnsi cannot encode \n, \t etc.
function s(v: string | null | undefined): string {
  return (v ?? '').replace(/[\x00-\x1F\x7F]/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Generate a signed AOD PDF.
 *
 * Strategy:
 *  1. If job.efexAodUrl exists → download it (EFEX already filled all fields)
 *  2. Otherwise → fall back to blank template in /public/efex-aod-template.pdf
 *
 * Then embed the customer signature at the \s1\ token position,
 * signer name at \n1\, and date at \d1\.
 *
 * Token positions extracted from real filled EFEX AOD via pdfminer:
 *  \s1\  x=170.9, y_top=375.4  → pdf-lib y_bottom ≈ 427 (45pt tall, 190pt wide)
 *  \n1\  x=34.0,  y_top≈364    → pdf-lib y ≈ 469
 *  \d1\  x=370.4, y_top≈364    → pdf-lib y ≈ 469
 */
export async function generateAODPdf(job: AODJobData, signatureDataUrl: string): Promise<Buffer> {
  let pdfBytes: ArrayBuffer

  if (job.efexAodUrl) {
    // Download the EFEX-sent AOD (has all customer/equipment info already)
    const res = await fetch(job.efexAodUrl)
    if (!res.ok) throw new Error(`Failed to fetch EFEX AOD: ${res.status}`)
    pdfBytes = await res.arrayBuffer()
  } else {
    // Fallback: blank EFEX template
    const templatePath = path.join(process.cwd(), 'public', 'efex-aod-template.pdf')
    pdfBytes = fs.readFileSync(templatePath).buffer as ArrayBuffer
  }

  const doc = await PDFDocument.load(pdfBytes)
  const page = doc.getPages()[0]
  const WHITE = rgb(1, 1, 1)

  // ── Embed customer signature at \s1\ position ────────────────────────────
  // White out the \s1\ token text
  page.drawRectangle({ x: 170.9, y: 422, width: 195, height: 52, color: WHITE })

  try {
    const b64 = signatureDataUrl.replace(/^data:image\/png;base64,/, '')
    const sigImg = await doc.embedPng(Buffer.from(b64, 'base64'))
    const sigDims = sigImg.scaleToFit(190, 48)
    page.drawImage(sigImg, {
      x: 170.9 + (190 - sigDims.width) / 2,
      y: 424 + (48 - sigDims.height) / 2,
      width: sigDims.width,
      height: sigDims.height,
    })
  } catch {
    // Leave blank if embed fails
  }

  // ── Fill \n1\ (signer name) ───────────────────────────────────────────────
  // "Name:\n\n1\" text box at x=34, y_top≈364 → pdf-lib y≈469
  const { StandardFonts } = await import('pdf-lib')
  const normal = await doc.embedFont(StandardFonts.Helvetica)
  const C_TEXT = rgb(0.05, 0.05, 0.05)

  page.drawRectangle({ x: 34, y: 455, width: 130, height: 18, color: WHITE })
  const signerName = s(job.endCustomerName) || s(job.clientName) || 'Customer'
  page.drawText(signerName, { x: 34, y: 460, font: normal, size: 9, color: C_TEXT })

  // ── Fill \d1\ (date) ─────────────────────────────────────────────────────
  // "Date:\n\d1\" text box at x=370.4, y_top≈364 → pdf-lib y≈469
  page.drawRectangle({ x: 370.4, y: 455, width: 130, height: 18, color: WHITE })
  const dateStr = job.scheduledDate
    ? new Date(job.scheduledDate).toLocaleDateString('en-AU')
    : new Date().toLocaleDateString('en-AU')
  page.drawText(dateStr, { x: 370.4, y: 460, font: normal, size: 9, color: C_TEXT })

  return Buffer.from(await doc.save())
}
