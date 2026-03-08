import { jsPDF } from 'jspdf'
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

export async function generateAODPdf(job: AODJobData, signatureDataUrl: string): Promise<Buffer> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  const pageW = doc.internal.pageSize.getWidth()
  const margin = 20
  let y = margin

  // ── Logo ──────────────────────────────────────────────────────────────
  try {
    const logoPath = path.join(process.cwd(), 'public', 'logo.png')
    const logoData = fs.readFileSync(logoPath)
    const logoB64 = logoData.toString('base64')
    doc.addImage(`data:image/png;base64,${logoB64}`, 'PNG', margin, y, 45, 18)
  } catch {
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(30, 30, 60)
    doc.text('HONOR LOGISTICS', margin, y + 10)
  }

  // ── Title (right-aligned) ─────────────────────────────────────────────
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(30, 30, 60)
  doc.text('Acknowledgment of Delivery', pageW - margin, y + 6, { align: 'right' })
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100, 100, 120)
  const now = new Date()
  doc.text(`Generated: ${now.toLocaleString('en-AU', { timeZone: 'Australia/Sydney' })}`, pageW - margin, y + 12, { align: 'right' })

  y += 28

  // ── Divider ───────────────────────────────────────────────────────────
  doc.setDrawColor(220, 220, 230)
  doc.setLineWidth(0.5)
  doc.line(margin, y, pageW - margin, y)
  y += 8

  // ── Section helper ────────────────────────────────────────────────────
  const sectionTitle = (title: string) => {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(100, 100, 120)
    doc.text(title.toUpperCase(), margin, y)
    y += 5
    doc.setDrawColor(230, 230, 240)
    doc.setLineWidth(0.3)
    doc.line(margin, y, pageW - margin, y)
    y += 4
  }

  const field = (label: string, value: string | null | undefined, col?: 'left' | 'right') => {
    const colX = col === 'right' ? pageW / 2 + 5 : margin
    const colW = col ? (pageW / 2 - margin - 5) : (pageW - margin * 2)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(80, 80, 100)
    doc.text(label, colX, y)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(30, 30, 50)
    const val = value || '—'
    const lines = doc.splitTextToSize(val, colW - 28)
    doc.text(lines, colX + 28, y)
    if (col !== 'left') y += Math.max(lines.length * 5, 6)
  }

  const fieldRow = (label1: string, val1: string | null, label2: string, val2: string | null) => {
    field(label1, val1, 'left')
    field(label2, val2, 'right')
  }

  // ── Job Details ───────────────────────────────────────────────────────
  sectionTitle('Job Details')
  fieldRow('Job Number', job.jobNumber, 'Service Type', job.jobType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()))
  fieldRow('Client', job.clientName, 'Staff', job.staffName)
  fieldRow(
    'Scheduled',
    job.scheduledDate ? new Date(job.scheduledDate).toLocaleDateString('en-AU') : null,
    'Completed',
    job.completedAt ? new Date(job.completedAt).toLocaleString('en-AU', { timeZone: 'Australia/Sydney' }) : 'On delivery'
  )
  y += 4

  // ── Customer & Delivery ───────────────────────────────────────────────
  sectionTitle('Customer & Delivery')
  field('Customer', job.endCustomerName)
  field('Address', job.deliveryAddress)
  y += 4

  // ── Machine Details ───────────────────────────────────────────────────
  sectionTitle('Machine Details')
  fieldRow('Make', job.machineMake, 'Model', job.machineModel)
  field('Serial No.', job.serialNumber)
  y += 4

  // ── Notes ─────────────────────────────────────────────────────────────
  if (job.notes) {
    sectionTitle('Notes')
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(50, 50, 70)
    const noteLines = doc.splitTextToSize(job.notes, pageW - margin * 2)
    doc.text(noteLines, margin, y)
    y += noteLines.length * 5 + 6
  }

  // ── Signature ─────────────────────────────────────────────────────────
  sectionTitle('Customer Signature')

  const sigBoxY = y
  const sigBoxH = 42
  const sigBoxW = 100

  // signature box background
  doc.setFillColor(250, 250, 255)
  doc.setDrawColor(200, 200, 220)
  doc.setLineWidth(0.5)
  doc.roundedRect(margin, sigBoxY, sigBoxW, sigBoxH, 2, 2, 'FD')

  try {
    doc.addImage(signatureDataUrl, 'PNG', margin + 4, sigBoxY + 4, sigBoxW - 8, sigBoxH - 8)
  } catch {
    doc.setFontSize(8)
    doc.setTextColor(150, 150, 160)
    doc.text('Signature unavailable', margin + sigBoxW / 2, sigBoxY + sigBoxH / 2, { align: 'center' })
  }

  // timestamp alongside
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(80, 80, 100)
  doc.text('Date & Time:', margin + sigBoxW + 8, sigBoxY + 8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(30, 30, 50)
  doc.text(now.toLocaleString('en-AU', { timeZone: 'Australia/Sydney' }), margin + sigBoxW + 8, sigBoxY + 14)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(80, 80, 100)
  doc.text('Signed by:', margin + sigBoxW + 8, sigBoxY + 24)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(30, 30, 50)
  doc.text(job.endCustomerName || 'Customer', margin + sigBoxW + 8, sigBoxY + 30)

  y = sigBoxY + sigBoxH + 8

  // ── Footer ────────────────────────────────────────────────────────────
  const footerY = doc.internal.pageSize.getHeight() - 12
  doc.setDrawColor(220, 220, 230)
  doc.setLineWidth(0.3)
  doc.line(margin, footerY - 4, pageW - margin, footerY - 4)
  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(130, 130, 150)
  doc.text('Honor Removals & Logistics  |  automation@honorremovals.com.au', pageW / 2, footerY, { align: 'center' })
  doc.text('This document serves as proof of delivery and customer acceptance.', pageW / 2, footerY + 4, { align: 'center' })

  // Return as Buffer
  const arrayBuffer = doc.output('arraybuffer')
  return Buffer.from(arrayBuffer)
}
