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

/**
 * Parse a Kyocera packing list PDF buffer into structured data.
 * Uses pdf-parse for text extraction. If text is too short (scanned image PDF),
 * returns a result with extractionFailed=true so callers can handle it.
 *
 * @param {Buffer} pdfBuffer
 * @returns {Promise<Object>} Parsed packing list data
 */
export async function parsePackingListPdf(pdfBuffer) {
  let fullText = ''
  
  try {
    const pdfParse = require('pdf-parse')
    const data = await pdfParse(pdfBuffer)
    fullText = data.text || ''
    console.log('PDF text length:', fullText.length, 'Preview:', fullText.slice(0, 200).replace(/\n/g, ' '))
  } catch (err) {
    console.error('pdf-parse failed:', err.message)
  }

  // If text extraction returned very little, the PDF is likely a scanned image
  if (fullText.length < 50) {
    console.warn('PDF text too short — likely a scanned image. Manual review or OCR required.')
    const result = parsePackingListText(fullText)
    result.extractionFailed = true
    result.rawTextLength = fullText.length
    return result
  }

  const result = parsePackingListText(fullText)
  result.extractionFailed = false
  result.rawTextLength = fullText.length
  return result
}

/**
 * Detect document type from extracted text and route to appropriate parser.
 */
export function detectAndParse(text) {
  // Detect delivery docket format (Evolved Digital, Mitronics, etc.)
  if (/DELIVERY DOCKET/i.test(text) || /Acceptance of Delivery/i.test(text)) {
    return parseDeliveryDocket(text)
  }
  // Detect meter count / status page (not a packing list)
  if (/Meter Count List/i.test(text) || /Status Page\s*\n\s*MFP/i.test(text)) {
    return parseMeterCountPage(text)
  }
  // Detect EFEX acknowledgement of delivery
  if (/ACKNOWLEDGEMENT OF DELIVERY/i.test(text) || /efex/i.test(text)) {
    return parseEfexAoD(text)
  }
  // Default: Kyocera packing list format
  return parsePackingListText(text)
}

/**
 * Parse delivery docket format (Evolved Digital, Mitronics, etc.)
 */
function parseDeliveryDocket(text) {
  const result = {
    documentType: 'delivery_docket',
    shipDate: null,
    shipmentId: null,
    customerPO: null,
    connote: null,
    shipFrom: null,
    shipTo: null,
    specialInstructions: null,
    lineItems: [],
    pageCount: null,
    primaryMachine: null,
    machines: [],
    accessories: [],
  }

  // Date
  const dateMatch = text.match(/Date:\s*(\d{1,2}[-–\/]\w{3}[-–\/]\d{2,4})/i)
  if (dateMatch) result.shipDate = dateMatch[1]

  // Reference numbers
  const yourRefMatch = text.match(/Your\s*Ref:\s*(\S+)/i)
  if (yourRefMatch) result.customerPO = yourRefMatch[1]
  const ourRefMatch = text.match(/Our\s*Ref:\s*(\S+)/i)
  if (ourRefMatch) result.shipmentId = ourRefMatch[1]

  // Carrier / connote
  const carrierMatch = text.match(/Carrier:\s*(\S+)/i)
  if (carrierMatch) result.connote = carrierMatch[1]

  // Ship From (first address block)
  const fromMatch = text.match(/^([A-Z][A-Z\s&]+(?:PTY LTD|LTD|INC)?)\n([A-Z0-9].*?\n.*?NSW\s+\d{4})/im)
  if (fromMatch) result.shipFrom = `${fromMatch[1].trim()}, ${fromMatch[2].replace(/\n/g, ', ').trim()}`

  // Deliver To
  const deliverToMatch = text.match(/Deliver\s*To:\s*\n?([\s\S]*?)(?=Ph:|Fax:|$)/i)
  if (deliverToMatch) result.shipTo = deliverToMatch[1].replace(/\n/g, ', ').replace(/\s+/g, ' ').trim()

  // Ship To (Mitronics format)
  const shipToMatch = text.match(/Ship\s*To\s*\n?Ship:\s*([\s\S]*?)(?=Tel:|Fax:|Via:|Ship Ref:)/i)
  if (shipToMatch && !result.shipTo) result.shipTo = shipToMatch[1].replace(/\n/g, ', ').replace(/\s+/g, ' ').trim()

  // Customer name from Ship To (Mitronics) or item description
  const customerInItem = text.match(/(?:Item Description[\s\S]*?)\n([A-Z][A-Za-z\s&]+(?:Pty Ltd|PTY LTD))/i)
  
  // Machine model and serial from item description
  const modelMatch = text.match(/(APEOS\s+\S+|HP\s+LASERJET\s+\S+\s+\S+|ECOSYS\s+\S+|TASKalfa\s+\S+|KM[\s_]\S+)/i)
  const serialMatch = text.match(/Serial\s*#?:?\s*(\S+)/i)

  if (modelMatch) {
    const item = {
      itemCode: '',
      description: modelMatch[0].trim(),
      orderedQty: 1,
      shippedQty: 1,
      serialNumbers: serialMatch ? [serialMatch[1]] : [],
    }
    result.lineItems.push(item)
    result.machines.push(item)
    result.primaryMachine = item
  }

  // Instructions (Mitronics format)
  const instrMatch = text.match(/Instructions:\s*(.*)/i)
  if (instrMatch) result.specialInstructions = instrMatch[1].trim()

  // Contact 
  const contactMatch = text.match(/Contact:\s*(.*)/i)
  if (contactMatch) result.contactName = contactMatch[1].trim()

  // Customer name from item description line or Attn field
  const attnMatch = text.match(/Attn:\s*(.*?)(?:\s{2,}|$)/i)
  if (customerInItem) result.customerName = customerInItem[1].trim()
  if (attnMatch && !result.customerName) result.customerName = attnMatch[1].trim()
  
  // Job number from Mitronics format
  const jobMatch = text.match(/Job#\s*(\d+)/i)
  if (jobMatch) result.externalJobNumber = jobMatch[1]

  return result
}

/**
 * Parse EFEX Acknowledgement of Delivery
 */
function parseEfexAoD(text) {
  const result = {
    documentType: 'efex_aod',
    shipDate: null,
    shipmentId: null,
    customerPO: null,
    connote: null,
    shipFrom: null,
    shipTo: null,
    specialInstructions: null,
    lineItems: [],
    pageCount: null,
    primaryMachine: null,
    machines: [],
    accessories: [],
  }

  // Customer name
  const nameMatch = text.match(/Name:\s*(.*?)(?:\n|$)/i)
  if (nameMatch) result.customerName = nameMatch[1].trim()

  // Equipment table
  const modelMatch = text.match(/(Kyocera\s+\S+\s+\S+|TASKalfa\s+\S+|ECOSYS\s+\S+)/i)
  const serialMatch = text.match(/Serial\/Identifier\s*No\(?s?\)?\s*\n?.*?([A-Z0-9]{6,})/i)
    || text.match(/\|\s*([A-Z0-9]{6,})\s*\|/i)
  const locationMatch = text.match(/Location\s*\n?.*?(\d+\s+[A-Za-z].*?(?:NSW|VIC|QLD|SA|WA|TAS|NT|ACT)\s+\d{4})/i)

  if (modelMatch) {
    const item = {
      itemCode: '',
      description: modelMatch[0].trim(),
      orderedQty: 1,
      shippedQty: 1,
      serialNumbers: serialMatch ? [serialMatch[1]] : [],
    }
    result.lineItems.push(item)
    result.machines.push(item)
    result.primaryMachine = item
  }

  if (locationMatch) result.shipTo = locationMatch[1].trim()

  // Date from signature section
  const dateMatch = text.match(/Date:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i)
  if (dateMatch) result.shipDate = dateMatch[1]

  return result
}

/**
 * Parse meter count / status page — extract machine model and serial at minimum
 */
function parseMeterCountPage(text) {
  const result = {
    documentType: 'meter_count',
    shipDate: null,
    shipmentId: null,
    customerPO: null,
    connote: null,
    shipFrom: null,
    shipTo: null,
    specialInstructions: null,
    lineItems: [],
    pageCount: null,
    primaryMachine: null,
    machines: [],
    accessories: [],
  }

  // Device name / model
  const deviceMatch = text.match(/Device\s*Name\s*:?\s*(\S+)/i)
    || text.match(/^MFP\s*\n\s*(TASKalfa\s+\S+|ECOSYS\s+\S+|KM[\s_]\S+)/im)
  
  // Serial from header
  const serialMatch = text.match(/Serial\s*No\.?\s*:?\s*([A-Z0-9]{6,})/i)

  // Date
  const dateMatch = text.match(/(\d{1,2}\/\d{1,2}\/\d{4})/i)
  if (dateMatch) result.shipDate = dateMatch[1]

  if (deviceMatch) {
    const item = {
      itemCode: '',
      description: deviceMatch[1].trim(),
      orderedQty: 1,
      shippedQty: 1,
      serialNumbers: serialMatch ? [serialMatch[1]] : [],
    }
    result.lineItems.push(item)
    result.machines.push(item)
    result.primaryMachine = item
  }

  // Customer name from handwritten note or device name
  const customerMatch = text.match(/Device\s*Name\s*:?\s*(.*?)(?:\n|$)/i)
  if (customerMatch && !/^(KM|TASKalfa|ECOSYS)/i.test(customerMatch[1])) {
    result.customerName = customerMatch[1].trim()
  }

  return result
}

/**
 * Parse Kyocera packing list text format.
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
