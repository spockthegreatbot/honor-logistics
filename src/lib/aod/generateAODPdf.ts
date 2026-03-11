import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
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
 * Mode A (preferred): job.efexAodUrl exists
 *   → Download EFEX-sent AOD (already has all customer/equipment info)
 *   → Only add signature, signer name, date
 *
 * Mode B (fallback): no EFEX AOD yet
 *   → Load blank EFEX template from /public/efex-aod-template.pdf
 *   → Pre-fill Customer Name, Equipment table from job card data
 *   → Add signature, signer name, date
 *
 * Token positions (from pdfminer on real filled EFEX AOD, page 596×842 pts):
 *   \s1\  x=170.9, y_top=375.4  → pdf-lib y_bottom ≈ 422, height=52
 *   \n1\  x=34.0,  y_top≈364    → pdf-lib y ≈ 455 (white box), draw at 460
 *   \d1\  x=370.4, y_top≈364    → pdf-lib y ≈ 455 (white box), draw at 460
 */
export async function generateAODPdf(job: AODJobData, signatureDataUrl: string): Promise<Buffer> {
  const WHITE = rgb(1, 1, 1)
  const C_TEXT = rgb(0.05, 0.05, 0.05)

  let pdfBytes: ArrayBuffer
  let prefillFields = false

  if (job.efexAodUrl) {
    // Mode A: use EFEX-sent AOD as base — all fields already filled
    const res = await fetch(job.efexAodUrl)
    if (!res.ok) throw new Error(`Failed to fetch EFEX AOD: ${res.status}`)
    pdfBytes = await res.arrayBuffer()
  } else {
    // Mode B: blank template — we need to fill fields ourselves
    const templatePath = path.join(process.cwd(), 'public', 'efex-aod-template.pdf')
    pdfBytes = fs.readFileSync(templatePath).buffer as ArrayBuffer
    prefillFields = true
  }

  const doc = await PDFDocument.load(pdfBytes)
  const page = doc.getPages()[0]
  const normal = await doc.embedFont(StandardFonts.Helvetica)

  // ── Mode B: pre-fill customer + equipment fields ─────────────────────────
  if (prefillFields) {
    // Customer Name — after "Name:" label at x=34, y_top=124.7 → y_pdf≈708
    // "Name: " is ~35pts wide, so value starts at x≈69
    const customerName = s(job.endCustomerName) || s(job.clientName)
    if (customerName) {
      page.drawText(customerName, { x: 69, y: 708, font: normal, size: 9, color: C_TEXT, maxWidth: 480 })
    }

    // Equipment row at y_top=219.7 → y_pdf≈613
    // Columns: Qty(28.8) | Desc(78.1) | Serial(261.2) | Location(371.7)
    page.drawText('1', { x: 28.8, y: 613, font: normal, size: 9, color: C_TEXT })

    const desc = s(job.machineModel) || s(job.notes)
    if (desc) {
      // Truncate description to fit before serial column (~180pt wide)
      let d = desc
      while (d.length > 1 && normal.widthOfTextAtSize(d, 9) > 178) d = d.slice(0, -1)
      page.drawText(d, { x: 78.1, y: 613, font: normal, size: 9, color: C_TEXT })
    }

    const serial = s(job.serialNumber)
    if (serial) {
      page.drawText(serial, { x: 261.2, y: 613, font: normal, size: 9, color: C_TEXT, maxWidth: 105 })
    }

    const location = s(job.deliveryAddress)
    if (location) {
      // Smaller font for location — can be long
      let loc = location
      while (loc.length > 1 && normal.widthOfTextAtSize(loc, 8) > 185) loc = loc.slice(0, -1)
      page.drawText(loc, { x: 371.7, y: 613, font: normal, size: 8, color: C_TEXT })
    }
  }

  // ── Embed customer signature at \s1\ position ────────────────────────────
  // White out the \s1\ token text first
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
  page.drawRectangle({ x: 34, y: 455, width: 130, height: 18, color: WHITE })
  const signerName = s(job.endCustomerName) || s(job.clientName) || 'Customer'
  page.drawText(signerName, { x: 34, y: 460, font: normal, size: 9, color: C_TEXT })

  // ── Fill \d1\ (date) ─────────────────────────────────────────────────────
  page.drawRectangle({ x: 370.4, y: 455, width: 130, height: 18, color: WHITE })
  const dateStr = job.scheduledDate
    ? new Date(job.scheduledDate).toLocaleDateString('en-AU')
    : new Date().toLocaleDateString('en-AU')
  page.drawText(dateStr, { x: 370.4, y: 460, font: normal, size: 9, color: C_TEXT })

  return Buffer.from(await doc.save())
}
