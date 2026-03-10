import { PDFDocument, rgb, StandardFonts, PDFFont, PDFPage } from 'pdf-lib'
import fs from 'fs'
import path from 'path'

interface AODJobData {
  jobNumber: string | null
  jobType: string
  clientName: string | null
  endCustomerName: string | null
  deliveryAddress: string | null
  machineMake: string | null
  machineModel: string | null
  serialNumber: string | null
  staffName: string | null
  completedAt: string | null
  scheduledDate: string | null
  notes: string | null
}

// pdf-lib uses points (1 pt = 1/72 inch). A4 = 595 x 842 pts.
const A4_W = 595
const A4_H = 842
const MARGIN = 40

// Colours (0–1 range)
const C_DARK   = rgb(0.12, 0.12, 0.24)   // #1e1e3d  – headings
const C_MID    = rgb(0.39, 0.39, 0.47)   // #636378  – sub-labels
const C_BODY   = rgb(0.12, 0.12, 0.20)   // #1e1e33  – body text
const C_RULE   = rgb(0.86, 0.86, 0.90)   // #dbdbe6  – dividers
const C_SIG_BG = rgb(0.98, 0.98, 1.00)   // #fafaff  – sig box fill
const C_SIG_BR = rgb(0.78, 0.78, 0.86)   // #c7c7db  – sig box border

function wrapText(text: string, maxWidth: number, font: PDFFont, size: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    if (font.widthOfTextAtSize(test, size) <= maxWidth) {
      line = test
    } else {
      if (line) lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  return lines.length ? lines : ['']
}

// Strip all control characters (newlines, tabs etc.) from any string going into pdf-lib
function s(val: string | null | undefined): string {
  return (val ?? '').replace(/[\x00-\x1F\x7F]/g, ' ').replace(/\s+/g, ' ').trim()
}

export async function generateAODPdf(job: AODJobData, signatureDataUrl: string): Promise<Buffer> {
  // Sanitize all job fields upfront — WinAnsi cannot encode control chars
  const safe = {
    jobNumber:       s(job.jobNumber),
    jobType:         s(job.jobType),
    clientName:      s(job.clientName),
    endCustomerName: s(job.endCustomerName),
    deliveryAddress: s(job.deliveryAddress),
    machineModel:    s(job.machineModel),
    serialNumber:    s(job.serialNumber),
    scheduledDate:   s(job.scheduledDate),
    notes:           s(job.notes),
  }

  const doc = await PDFDocument.create()
  const page = doc.addPage([A4_W, A4_H])

  const bold   = await doc.embedFont(StandardFonts.HelveticaBold)
  const normal = await doc.embedFont(StandardFonts.Helvetica)

  const now = new Date()
  const nowStr = now.toLocaleString('en-AU', { timeZone: 'Australia/Sydney' })

  // pdf-lib y=0 is bottom — we work top-down with a cursor
  let cursorY = A4_H - MARGIN

  // ── Helper: draw text (top-left anchor) ──────────────────────────────────
  const text = (
    str: string,
    x: number,
    yTop: number,
    font: PDFFont,
    size: number,
    color = C_BODY,
  ) => {
    // WinAnsi cannot encode control chars — strip newlines and non-printable chars
    const safe = str.replace(/[\x00-\x1F\x7F]/g, ' ').trim()
    if (!safe) return
    page.drawText(safe, { x, y: yTop - size, font, size, color })
  }

  const textRight = (
    str: string,
    rightX: number,
    yTop: number,
    font: PDFFont,
    size: number,
    color = C_BODY,
  ) => {
    const w = font.widthOfTextAtSize(str, size)
    text(str, rightX - w, yTop, font, size, color)
  }

  // ── Logo ──────────────────────────────────────────────────────────────────
  const logoH = 36
  try {
    const logoPath = path.join(process.cwd(), 'public', 'logo.png')
    const logoBytes = fs.readFileSync(logoPath)
    const logoImg = await doc.embedPng(logoBytes)
    const logoDims = logoImg.scaleToFit(90, logoH)
    page.drawImage(logoImg, {
      x: MARGIN,
      y: cursorY - logoDims.height,
      width: logoDims.width,
      height: logoDims.height,
    })
  } catch {
    text('HONOR LOGISTICS', MARGIN, cursorY, bold, 14, C_DARK)
  }

  // ── Title (right-aligned) ─────────────────────────────────────────────────
  const titleW = bold.widthOfTextAtSize('Acknowledgment of Delivery', 17)
  page.drawText('Acknowledgment of Delivery', {
    x: A4_W - MARGIN - titleW,
    y: cursorY - 17,
    font: bold,
    size: 17,
    color: C_DARK,
  })
  textRight(`Generated: ${nowStr}`, A4_W - MARGIN, cursorY - 22, normal, 7, C_MID)

  cursorY -= logoH + 10

  // ── Horizontal divider ────────────────────────────────────────────────────
  const hRule = (y: number) => {
    page.drawLine({ start: { x: MARGIN, y }, end: { x: A4_W - MARGIN, y }, thickness: 0.5, color: C_RULE })
  }
  hRule(cursorY)
  cursorY -= 12

  // ── Section header helper ─────────────────────────────────────────────────
  const section = (label: string) => {
    text(label.toUpperCase(), MARGIN, cursorY, bold, 7.5, C_MID)
    cursorY -= 9
    hRule(cursorY)
    cursorY -= 7
  }

  // ── Two-column field row helper ───────────────────────────────────────────
  const colW = (A4_W - MARGIN * 2) / 2
  const LABEL_W = 55

  const field = (
    label: string,
    value: string | null | undefined,
    xOffset = MARGIN,
    width = A4_W - MARGIN * 2,
    advanceCursor = true,
  ) => {
    const val = value || '—'
    text(label, xOffset, cursorY, bold, 7.5, C_MID)
    const lines = wrapText(val, width - LABEL_W - 4, normal, 8)
    lines.forEach((line, i) => {
      text(line, xOffset + LABEL_W, cursorY - i * 10, normal, 8, C_BODY)
    })
    if (advanceCursor) cursorY -= Math.max(lines.length * 10, 11)
  }

  const fieldRow = (l1: string, v1: string | null, l2: string, v2: string | null) => {
    field(l1, v1, MARGIN, colW, false)
    field(l2, v2, MARGIN + colW + 5, colW, false)
    cursorY -= 11
  }

  // ── Job Details ───────────────────────────────────────────────────────────
  section('Job Details')
  fieldRow(
    'Job Number', safe.jobNumber,
    'Service Type', safe.jobType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
  )
  fieldRow('Client', safe.clientName, 'Staff', null)
  fieldRow(
    'Scheduled',
    safe.scheduledDate ? new Date(safe.scheduledDate).toLocaleDateString('en-AU') : null,
    'Completed',
    job.completedAt ? new Date(job.completedAt).toLocaleString('en-AU', { timeZone: 'Australia/Sydney' }) : 'On delivery',
  )
  cursorY -= 6

  // ── Customer & Delivery ───────────────────────────────────────────────────
  section('Customer & Delivery')
  field('Customer', safe.endCustomerName)
  field('Address', safe.deliveryAddress)
  cursorY -= 6

  // ── Machine Details ───────────────────────────────────────────────────────
  section('Machine Details')
  fieldRow('Make', null, 'Model', safe.machineModel)
  field('Serial No.', safe.serialNumber)
  cursorY -= 6

  // ── Notes ─────────────────────────────────────────────────────────────────
  if (safe.notes) {
    section('Notes')
    const noteLines = wrapText(safe.notes, A4_W - MARGIN * 2, normal, 8)
    noteLines.forEach((line, i) => {
      text(line, MARGIN, cursorY - i * 10, normal, 8, C_BODY)
    })
    cursorY -= noteLines.length * 10 + 8
  }

  // ── Signature box ─────────────────────────────────────────────────────────
  section('Customer Signature')

  const sigH = 90
  const sigW = 180

  page.drawRectangle({
    x: MARGIN,
    y: cursorY - sigH,
    width: sigW,
    height: sigH,
    color: C_SIG_BG,
    borderColor: C_SIG_BR,
    borderWidth: 0.8,
  })

  // Embed signature image
  try {
    // signatureDataUrl is "data:image/png;base64,<data>"
    const b64 = signatureDataUrl.replace(/^data:image\/png;base64,/, '')
    const sigBytes = Buffer.from(b64, 'base64')
    const sigImg = await doc.embedPng(sigBytes)
    const sigDims = sigImg.scaleToFit(sigW - 10, sigH - 10)
    page.drawImage(sigImg, {
      x: MARGIN + (sigW - sigDims.width) / 2,
      y: cursorY - sigH + (sigH - sigDims.height) / 2,
      width: sigDims.width,
      height: sigDims.height,
    })
  } catch {
    text('Signature unavailable', MARGIN + sigW / 2 - 30, cursorY - sigH / 2, normal, 8, C_MID)
  }

  // Timestamp alongside
  const sideX = MARGIN + sigW + 14
  text('Date & Time:', sideX, cursorY - 6,  bold,   7.5, C_MID)
  text(nowStr,        sideX, cursorY - 17, normal,  8,   C_BODY)
  text('Signed by:',  sideX, cursorY - 34,  bold,   7.5, C_MID)
  text(safe.endCustomerName || 'Customer', sideX, cursorY - 45, normal, 8, C_BODY)

  cursorY -= sigH + 12

  // ── Footer ────────────────────────────────────────────────────────────────
  const footerY = 20
  hRule(footerY + 12)
  page.drawText('Honor Removals & Logistics  |  automation@honorremovals.com.au', {
    x: A4_W / 2 - normal.widthOfTextAtSize('Honor Removals & Logistics  |  automation@honorremovals.com.au', 7) / 2,
    y: footerY + 4,
    font: normal,
    size: 7,
    color: C_MID,
  })
  page.drawText('This document serves as proof of delivery and customer acceptance.', {
    x: A4_W / 2 - normal.widthOfTextAtSize('This document serves as proof of delivery and customer acceptance.', 7) / 2,
    y: footerY - 6,
    font: normal,
    size: 7,
    color: C_MID,
  })

  const pdfBytes = await doc.save()
  return Buffer.from(pdfBytes)
}
