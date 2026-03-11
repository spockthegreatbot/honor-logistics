import { PDFDocument, StandardFonts, rgb, PDFFont } from 'pdf-lib'
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
  faultDescription?: string | null
}

// Strip control characters — WinAnsi cannot encode \n, \t etc.
function s(v: string | null | undefined): string {
  return (v ?? '').replace(/[\x00-\x1F\x7F]/g, ' ').replace(/\s+/g, ' ').trim()
}

export async function generateAODPdf(job: AODJobData, signatureDataUrl: string): Promise<Buffer> {
  // Load EFEX template PDF
  const templatePath = path.join(process.cwd(), 'public', 'efex-aod-template.pdf')
  const templateBytes = fs.readFileSync(templatePath)
  const doc = await PDFDocument.load(templateBytes)
  const page = doc.getPages()[0]
  const { height } = page.getSize()
  // A4: width≈595, height≈842 pts. pdf-lib y=0 at bottom.

  const normal: PDFFont = await doc.embedFont(StandardFonts.Helvetica)
  const C_TEXT = rgb(0.1, 0.1, 0.1)

  // Draw text at top-left coordinates (converted to pdf-lib bottom-left)
  const drawAt = (text: string, xFromLeft: number, yFromTop: number, size = 9) => {
    const clean = s(text)
    if (!clean) return
    page.drawText(clean, {
      x: xFromLeft,
      y: height - yFromTop,
      font: normal,
      size,
      color: C_TEXT,
    })
  }

  // ── CUSTOMER section ─────────────────────────────────────────────────────
  // "Name:" label is at ~y=165 from top; fill value to the right
  drawAt(s(job.endCustomerName) || s(job.clientName), 115, 168)

  // ── EQUIPMENT table ───────────────────────────────────────────────────────
  // First row starts at ~y=295 from top
  // Columns: Qty(52) | Description(122) | Serial(385) | Location(488)
  drawAt('1', 52, 295)
  drawAt(s(job.machineModel) || s(job.faultDescription) || s(job.notes), 122, 295)
  drawAt(s(job.serialNumber), 385, 295)
  drawAt(s(job.deliveryAddress).substring(0, 85), 488, 295, 7)

  // ── SIGNATURE section ─────────────────────────────────────────────────────
  // White out the \s1\ token area so placeholder text is hidden
  page.drawRectangle({
    x: 214,
    y: height - 550,
    width: 175,
    height: 55,
    color: rgb(1, 1, 1),
  })

  // Embed customer signature image
  try {
    const b64 = signatureDataUrl.replace(/^data:image\/png;base64,/, '')
    const sigImg = await doc.embedPng(Buffer.from(b64, 'base64'))
    const sigDims = sigImg.scaleToFit(170, 50)
    page.drawImage(sigImg, {
      x: 214 + (170 - sigDims.width) / 2,
      y: height - 548 + (50 - sigDims.height) / 2,
      width: sigDims.width,
      height: sigDims.height,
    })
  } catch {
    // Leave blank if embed fails
  }

  // Signer name (auto-filled from job) at \n1\ position
  drawAt(s(job.endCustomerName) || 'Customer', 100, 520)

  // Date at \d1\ position
  const dateStr = job.scheduledDate
    ? new Date(job.scheduledDate).toLocaleDateString('en-AU')
    : new Date().toLocaleDateString('en-AU')
  drawAt(dateStr, 535, 520)

  return Buffer.from(await doc.save())
}
