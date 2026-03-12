#!/usr/bin/env node
/**
 * Kyocera Packing List PDF Parser
 * 
 * Extracts structured data from Kyocera "OK To Install" packing list PDFs.
 * These PDFs contain:
 *   - Ship date, Shipment ID, Customer PO, Connote
 *   - Ship From / Ship To addresses
 *   - Line items: item code, description, ordered qty, shipped qty, serial numbers
 */

import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { PDFParse } = require('pdf-parse')

/**
 * Parse a Kyocera packing list PDF buffer into structured data.
 * @param {Buffer} pdfBuffer
 * @returns {Promise<Object>} Parsed packing list data
 */
export async function parsePackingListPdf(pdfBuffer) {
  const parser = new PDFParse()
  const result = await parser.loadPDF(pdfBuffer)
  
  // Get text from all pages
  const pages = []
  for (let i = 0; i < result.numPages; i++) {
    const page = await result.getPage(i + 1)
    const textContent = await page.getTextContent()
    const text = textContent.items.map(item => item.str).join(' ')
    pages.push(text)
  }
  
  const fullText = pages.join('\n')
  return parsePackingListText(fullText)
}

/**
 * Alternative: parse from pre-extracted text (when using pdf tool or other extractor)
 */
export function parsePackingListText(text) {
  const result = {
    shipDate: null,
    shipmentId: null,
    customerPO: null,
    connote: null,
    shipFrom: null,
    shipTo: null,
    specialInstructions: null,
    lineItems: [],
    pageCount: null,
  }

  // Normalize whitespace
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const fullText = text

  // Ship Date
  const shipDateMatch = fullText.match(/Ship\s*Date\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i)
  if (shipDateMatch) result.shipDate = shipDateMatch[1]

  // Shipment ID
  const shipmentIdMatch = fullText.match(/Shipment\s*ID\s*:?\s*(\d+)/i)
  if (shipmentIdMatch) result.shipmentId = shipmentIdMatch[1]

  // Customer PO
  const customerPOMatch = fullText.match(/Customer\s*PO\s*:?\s*([A-Z0-9]+)/i)
  if (customerPOMatch) result.customerPO = customerPOMatch[1]

  // Connote
  const connoteMatch = fullText.match(/Connote\s*:?\s*(\d+)/i)
  if (connoteMatch) result.connote = connoteMatch[1]

  // Ship From address
  const shipFromMatch = fullText.match(/Ship\s*From\s*:?\s*\n?([\s\S]*?)(?=Ship\s*To|Shipment\s*ID|Customer\s*PO)/i)
  if (shipFromMatch) {
    result.shipFrom = shipFromMatch[1]
      .replace(/\s+/g, ' ')
      .replace(/Shipment ID.*$/i, '')
      .replace(/Customer PO.*$/i, '')
      .trim()
  }

  // Ship To address
  const shipToMatch = fullText.match(/Ship\s*To\s*:?\s*\n?([\s\S]*?)(?=Connote|Special\s*Instructions|Item\s+Description)/i)
  if (shipToMatch) {
    result.shipTo = shipToMatch[1]
      .replace(/\s+/g, ' ')
      .replace(/Connote.*$/i, '')
      .trim()
  }

  // Page count
  const pageMatch = fullText.match(/Page\s+(\d+)\s+of\s+(\d+)/i)
  if (pageMatch) result.pageCount = parseInt(pageMatch[2])

  // Parse line items
  // Kyocera format: ItemCode Description OrderedQty ShippedQty
  // Serial numbers appear on lines below the item
  
  // Pattern: alphanumeric item code (10+ chars) followed by description and quantities
  const itemPattern = /^([A-Z0-9]{8,})\s+(.+?)\s+(\d+\.?\d*)\s*EA\s+[~-]?(\d+\.?\d*)\s*EA/gm
  const serialPattern = /([A-Z0-9]{10,}[A-Z0-9]+)/g

  // Split into sections by finding item codes
  const itemCodePattern = /\b([A-Z0-9]{8,20})\b/g
  
  // Better approach: work line by line through the text
  const textLines = fullText.split(/\n/)
  let currentItem = null
  
  for (const line of textLines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    
    // Skip headers and footers
    if (/^(Packing List|KYOCERA|Ship Date|Ship From|Ship To|Shipment ID|Customer PO|Connote|Special Instructions|Item\s+Description|Ordered|Shipped|Please check|Page \d)/i.test(trimmed)) continue
    if (/^-+$/.test(trimmed)) continue
    if (/^\d+\/\d+\/\d+\s+\d+:\d+/.test(trimmed)) continue
    if (/^Attn:/i.test(trimmed)) continue

    // Try to match a line item: ItemCode Description Qty EA Qty EA
    const itemMatch = trimmed.match(/^([A-Z0-9]{8,20})\s+(.+?)\s+(\d+\.?\d*)\s*EA\s+[~\-]?\s*(\d+\.?\d*)\s*EA$/i)
    if (itemMatch) {
      if (currentItem) result.lineItems.push(currentItem)
      currentItem = {
        itemCode: itemMatch[1],
        description: itemMatch[2].trim(),
        orderedQty: parseFloat(itemMatch[3]),
        shippedQty: parseFloat(itemMatch[4]),
        serialNumbers: [],
      }
      continue
    }

    // Try to match item code + description without qty (qty on next extraction)
    const partialMatch = trimmed.match(/^([A-Z0-9]{8,20})\s+(.+?)(?:\s+(\d+\.?\d*)\s*EA)?$/i)
    if (partialMatch && !trimmed.match(/^(EFEX|KYOCERA|UNIT|MORTDALE|Kemps)/i)) {
      // Check if this looks like a new item code (not a serial number)
      const code = partialMatch[1]
      if (code.length <= 14 && /[A-Z]/.test(code) && /\d/.test(code)) {
        if (currentItem) result.lineItems.push(currentItem)
        currentItem = {
          itemCode: code,
          description: partialMatch[2].trim(),
          orderedQty: partialMatch[3] ? parseFloat(partialMatch[3]) : null,
          shippedQty: null,
          serialNumbers: [],
        }
        continue
      }
    }

    // Check for serial numbers (long alphanumeric strings, typically 15+ chars)
    if (currentItem) {
      const serialMatch = trimmed.match(/^([A-Z0-9]{14,})$/i)
      if (serialMatch) {
        currentItem.serialNumbers.push(serialMatch[1])
        continue
      }
      
      // Serial Number(s): label
      const labeledSerial = trimmed.match(/Serial\s*Number\(?s?\)?\s*:?\s*([A-Z0-9]{10,})?/i)
      if (labeledSerial) {
        if (labeledSerial[1]) currentItem.serialNumbers.push(labeledSerial[1])
        continue
      }

      // Description continuation (short text without item code pattern)
      if (trimmed.length < 60 && !/\d{5,}/.test(trimmed) && !/EA$/.test(trimmed)) {
        // Could be a description continuation
        if (!trimmed.match(/^[A-Z0-9]{14,}$/)) {
          // Append to description if it doesn't look like a serial
          if (currentItem.description && !currentItem.description.includes(trimmed)) {
            currentItem.description += ' ' + trimmed
          }
        }
      }
    }
  }

  if (currentItem) result.lineItems.push(currentItem)

  // Identify primary machine (largest/most expensive item, typically MFD/printer)
  const machineKeywords = ['ECOSYS', 'TASKalfa', 'LASER', 'PRINT', 'COLOUR', 'MONO', 'MFD', 'PPM']
  result.primaryMachine = result.lineItems.find(item => 
    machineKeywords.some(kw => item.description.toUpperCase().includes(kw))
  ) || result.lineItems[0] || null

  // Separate machines from accessories/consumables
  const accessoryKeywords = ['TONER', 'KIT', 'PAPER FEEDER', 'DOCUMENT PROCESSOR', 'ATTACHMENT', 'STAPLE', 'FINISHER']
  result.machines = result.lineItems.filter(item =>
    machineKeywords.some(kw => item.description.toUpperCase().includes(kw))
  )
  result.accessories = result.lineItems.filter(item =>
    !machineKeywords.some(kw => item.description.toUpperCase().includes(kw))
  )

  return result
}

// If run directly, parse a test file
if (import.meta.url === `file://${process.argv[1]}`) {
  const { readFileSync } = await import('fs')
  const file = process.argv[2]
  if (!file) {
    console.error('Usage: node parse-runup-pdf.mjs <text-file-or-pdf>')
    process.exit(1)
  }
  const text = readFileSync(file, 'utf8')
  const result = parsePackingListText(text)
  console.log(JSON.stringify(result, null, 2))
}
