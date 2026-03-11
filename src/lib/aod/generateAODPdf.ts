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
  // Load EFEX AOD template
  const templatePath = path.join(process.cwd(), 'public', 'efex-aod-template.pdf')
  const templateBytes = fs.readFileSync(templatePath)
  const doc = await PDFDocument.load(templateBytes)
  const page = doc.getPages()[0]
  // Page is 596 x 842 pts (A4). pdf-lib y=0 at bottom.

  const normal: PDFFont = await doc.embedFont(StandardFonts.Helvetica)
  const C_TEXT = rgb(0.05, 0.05, 0.05)
  const WHITE = rgb(1, 1, 1)

  // ── Helpers ───────────────────────────────────────────────────────────────
  // Draw text at pdf-lib bottom-left coordinates
  const draw = (text: string, x: number, y: number, size = 9, maxWidth?: number) => {
    const clean = s(text)
    if (!clean) return
    // Truncate to maxWidth if specified
    let str = clean
    if (maxWidth) {
      while (str.length > 1 && normal.widthOfTextAtSize(str, size) > maxWidth) {
        str = str.slice(0, -1)
      }
    }
    page.drawText(str, { x, y, font: normal, size, color: C_TEXT })
  }

  // White rectangle to cover template placeholder tokens
  const whiteOut = (x: number, y: number, w: number, h: number) => {
    page.drawRectangle({ x, y, width: w, height: h, color: WHITE })
  }

  // ── CUSTOMER section ──────────────────────────────────────────────────────
  // "Name:" label is at x=34, y_top=124.7 → y_pdf=708.
  // Value goes after "Name: " (≈35pts wide) on the same line.
  draw(s(job.endCustomerName) || s(job.clientName), 69, 708, 9, 480)

  // "ACN/ABN:" label at x=34, y_top=147.9 → y_pdf=685.
  // No ACN/ABN in our data — leave blank (template already shows the label)

  // ── EQUIPMENT table ───────────────────────────────────────────────────────
  // First data row at y_top=219.7 → y_pdf≈613
  // Columns (exact from filled PDF): Qty(29) | Desc(78) | Serial(261) | Location(372)
  draw('1', 28.8, 613, 9)
  draw(s(job.machineModel) || s(job.notes), 78.1, 613, 9, 175) // cap before Serial col
  draw(s(job.serialNumber), 261.2, 613, 9, 105) // cap before Location col
  draw(s(job.deliveryAddress), 371.7, 613, 8, 185) // smaller font, cap at right margin

  // ── SIGNATURE section ─────────────────────────────────────────────────────
  // Positions extracted from real filled PDF via pdfminer:
  // \n1\ (signer name) is on 2nd line of "Name:\n\n1\" text box at y_top≈364 → y_pdf≈469
  // \s1\ (signature) is a separate text box at x=170.9, y_top=375.4 → y_pdf bottom≈427
  // \d1\ (date) is on 2nd line of "Date:\n\d1\" text box at y_top≈364 → y_pdf≈469

  // White out \n1\ token area
  whiteOut(34, 455, 130, 18)
  draw(s(job.endCustomerName) || 'Customer', 34, 460, 9, 125)

  // White out \s1\ token area and embed signature
  whiteOut(170.9, 425, 195, 55)
  try {
    const b64 = signatureDataUrl.replace(/^data:image\/png;base64,/, '')
    const sigImg = await doc.embedPng(Buffer.from(b64, 'base64'))
    const sigDims = sigImg.scaleToFit(190, 50)
    page.drawImage(sigImg, {
      x: 170.9 + (190 - sigDims.width) / 2,
      y: 427 + (50 - sigDims.height) / 2,
      width: sigDims.width,
      height: sigDims.height,
    })
  } catch {
    // Leave blank if embed fails
  }

  // White out \d1\ token area and draw date
  whiteOut(370.4, 455, 130, 18)
  const dateStr = job.scheduledDate
    ? new Date(job.scheduledDate).toLocaleDateString('en-AU')
    : new Date().toLocaleDateString('en-AU')
  draw(dateStr, 370.4, 460, 9)

  return Buffer.from(await doc.save())
}
