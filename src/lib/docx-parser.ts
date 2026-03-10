import JSZip from 'jszip'

export interface BookingFormData {
  customer: string | null
  orderTypes: string[]
  deliveryDate: string | null
  contactName: string | null
  contactPhone: string | null
  timeConstraint: string | null
  machineModel: string | null
  machineAccessories: string | null
  serialNumber: string | null
  installIdca: boolean | null
  address: string | null
  stairWalker: boolean | null
  stairWalkerComment: string | null
  parking: boolean | null
  parkingComment: string | null
  pickupModel: string | null
  pickupAccessories: string | null
  pickupSerial: string | null
  pickupDisposal: string | null
  specialInstructions: string | null
  efexRef: string | null
}

function stripXml(xml: string): string {
  return xml.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
}

function extractRows(xml: string): string[] {
  const rows: string[] = []
  const re = /<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) rows.push(m[0])
  return rows
}

function extractCells(rowXml: string): string[] {
  const cells: string[] = []
  const re = /<w:tc\b[^>]*>[\s\S]*?<\/w:tc>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(rowXml)) !== null) cells.push(m[0])
  return cells
}

function cellText(cellXml: string): string {
  return stripXml(cellXml)
}

function rowText(rowXml: string): string {
  return stripXml(rowXml)
}

/** Find checkboxes (w14:checkbox SDT blocks) within XML and return checked states */
function findCheckboxes(xml: string): boolean[] {
  const results: boolean[] = []
  const sdtRe = /<w:sdt\b[^>]*>[\s\S]*?<\/w:sdt>/g
  let m: RegExpExecArray | null
  while ((m = sdtRe.exec(xml)) !== null) {
    const block = m[0]
    if (!block.includes('w14:checkbox') && !block.includes('w14:checked')) continue
    const checkedMatch = block.match(/w14:checked\s+w14:val="(\d)"/)
    if (checkedMatch) {
      results.push(checkedMatch[1] === '1')
    } else if (block.includes('w14:checkbox')) {
      results.push(false)
    }
  }
  return results
}

/** Find the index of a row whose text contains a label */
function findRowIndex(rows: string[], label: string): number {
  const lower = label.toLowerCase()
  for (let i = 0; i < rows.length; i++) {
    if (rowText(rows[i]).toLowerCase().includes(lower)) return i
  }
  return -1
}

export async function parseBookingForm(buffer: Buffer): Promise<BookingFormData> {
  const zip = await JSZip.loadAsync(buffer)
  const docXml = await zip.file('word/document.xml')?.async('string')
  if (!docXml) throw new Error('No word/document.xml found in DOCX')

  const allRows = extractRows(docXml)

  // Helper: get cell text by index from a row
  const getCellAt = (rowIdx: number, cellIdx: number): string | null => {
    if (rowIdx < 0 || rowIdx >= allRows.length) return null
    const cells = extractCells(allRows[rowIdx])
    if (cellIdx >= cells.length) return null
    const t = cellText(cells[cellIdx])
    return t || null
  }

  // ── ROW 0: CUSTOMER | value ──
  const customerIdx = findRowIndex(allRows, 'CUSTOMER')
  const customer = customerIdx >= 0 ? getCellAt(customerIdx, 1) : null

  // ── ROW 1: ORDER TYPE with 3 checkboxes ──
  const orderTypeIdx = findRowIndex(allRows, 'ORDER TYPE')
  const orderTypes: string[] = []
  if (orderTypeIdx >= 0) {
    const checkboxes = findCheckboxes(allRows[orderTypeIdx])
    const typeMap = ['delivery', 'installation', 'pickup']
    for (let i = 0; i < Math.min(checkboxes.length, typeMap.length); i++) {
      if (checkboxes[i]) orderTypes.push(typeMap[i])
    }
  }

  // ── ROW 2: DELIVERY DATE | value ──
  const dateIdx = findRowIndex(allRows, 'DELIVERY DATE')
  let deliveryDate: string | null = null
  if (dateIdx >= 0) {
    const raw = getCellAt(dateIdx, 1)
    if (raw) {
      const dm = raw.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/)
      deliveryDate = dm ? `${dm[1].padStart(2, '0')}-${dm[2].padStart(2, '0')}-${dm[3]}` : raw.trim()
    }
  }

  // ── ROW 3: BEST CONTACT ON SITE NAME & NUMBER | value ──
  const contactIdx = findRowIndex(allRows, 'BEST CONTACT')
  let contactName: string | null = null
  let contactPhone: string | null = null
  if (contactIdx >= 0) {
    const contactRaw = getCellAt(contactIdx, 1)
    if (contactRaw) {
      const parts = contactRaw.split(/\s+-\s+/)
      if (parts.length >= 2) {
        contactName = parts[0].trim()
        contactPhone = parts.slice(1).join(' - ').trim()
      } else {
        contactName = contactRaw
      }
    }
  }

  // ── ROW 4: TIME | value ──
  const timeIdx = findRowIndex(allRows, 'TIME')
  let timeConstraint: string | null = null
  if (timeIdx >= 0) {
    const t = getCellAt(timeIdx, 1)
    timeConstraint = t || null
  }

  // ── ROW 5: header (MODEL/PART NUMBER | ACCESSORIES/PART NUMBER | SERIAL NUMBER)
  // ── ROW 6: values ──
  let machineModel: string | null = null
  let machineAccessories: string | null = null
  let serialNumber: string | null = null
  const modelHeaderIdx = findRowIndex(allRows, 'MODEL')
  if (modelHeaderIdx >= 0 && modelHeaderIdx + 1 < allRows.length) {
    const valueRowIdx = modelHeaderIdx + 1
    machineModel = getCellAt(valueRowIdx, 0)
    machineAccessories = getCellAt(valueRowIdx, 1)
    serialNumber = getCellAt(valueRowIdx, 2)
  }

  // ── ROW 9: Install IDCA | YES/NO checkboxes ──
  const idcaIdx = findRowIndex(allRows, 'IDCA')
  let installIdca: boolean | null = null
  if (idcaIdx >= 0) {
    const checkboxes = findCheckboxes(allRows[idcaIdx])
    if (checkboxes.length >= 2) {
      if (checkboxes[0]) installIdca = true
      else if (checkboxes[1]) installIdca = false
    } else if (checkboxes.length === 1) {
      installIdca = checkboxes[0]
    }
  }

  // ── ROW 10: ADDRESS | value ──
  const addressIdx = findRowIndex(allRows, 'ADDRESS')
  const address = addressIdx >= 0 ? getCellAt(addressIdx, 1) : null

  // ── ROW 11: STAIR WALKER | YES/NO checkboxes + COMMENT ──
  const stairIdx = findRowIndex(allRows, 'STAIR WALKER')
  let stairWalker: boolean | null = null
  let stairWalkerComment: string | null = null
  if (stairIdx >= 0) {
    const checkboxes = findCheckboxes(allRows[stairIdx])
    if (checkboxes.length >= 2) {
      if (checkboxes[0]) stairWalker = true
      else if (checkboxes[1]) stairWalker = false
    }
    const text = rowText(allRows[stairIdx])
    const cm = text.match(/COMMENT[:\s]+(.+)/i)
    if (cm && cm[1].trim()) stairWalkerComment = cm[1].trim()
  }

  // ── ROW 12: PARKING | YES/NO checkboxes + COMMENT ──
  const parkingIdx = findRowIndex(allRows, 'PARKING')
  let parking: boolean | null = null
  let parkingComment: string | null = null
  if (parkingIdx >= 0) {
    const checkboxes = findCheckboxes(allRows[parkingIdx])
    if (checkboxes.length >= 2) {
      if (checkboxes[0]) parking = true
      else if (checkboxes[1]) parking = false
    }
    const text = rowText(allRows[parkingIdx])
    const cm = text.match(/COMMENT[:\s]+(.+)/i)
    if (cm && cm[1].trim()) parkingComment = cm[1].trim()
  }

  // ── ROW 13: header (PICK-UP MODEL | PICK-UP ACCESSORIES | PICK-UP S/N | RECYCLE/...)
  // ── ROW 14: values ──
  const pickupHeaderIdx = findRowIndex(allRows, 'PICK-UP MODEL')
  let pickupModel: string | null = null
  let pickupAccessories: string | null = null
  let pickupSerial: string | null = null
  let pickupDisposal: string | null = null
  if (pickupHeaderIdx >= 0 && pickupHeaderIdx + 1 < allRows.length) {
    const valueRowIdx = pickupHeaderIdx + 1
    const valRowText = rowText(allRows[valueRowIdx])
    // Only parse if the value row has content (not another header/label)
    if (valRowText && !valRowText.includes('SPECIAL INSTRUCTIONS')) {
      pickupModel = getCellAt(valueRowIdx, 0)
      pickupAccessories = getCellAt(valueRowIdx, 1)
      pickupSerial = getCellAt(valueRowIdx, 2)
      // Cell 3 might have disposition text like "Peakhurst/refrub"
      const dispText = getCellAt(valueRowIdx, 3)
      if (dispText) {
        const dispLower = dispText.toLowerCase()
        if (dispLower.includes('recycle')) pickupDisposal = 'Recycle'
        else if (dispLower.includes('refurb') || dispLower.includes('refrub')) pickupDisposal = 'Refurb'
        else if (dispLower.includes('loan')) pickupDisposal = 'Loan'
        else if (dispLower.includes('scrap')) pickupDisposal = 'Scrap'
        else pickupDisposal = dispText
      }
    }
  }

  // ── ROW 17: SPECIAL INSTRUCTIONS ──
  const specialIdx = findRowIndex(allRows, 'SPECIAL INSTRUCTIONS')
  let specialInstructions: string | null = null
  if (specialIdx >= 0) {
    const fullText = rowText(allRows[specialIdx])
    const si = fullText.toUpperCase().indexOf('SPECIAL INSTRUCTIONS')
    if (si >= 0) {
      let after = fullText.slice(si + 'SPECIAL INSTRUCTIONS'.length).trim()
      if (after.startsWith(':')) after = after.slice(1).trim()
      specialInstructions = after || null
    }
  }

  return {
    customer: customer ?? null,
    orderTypes,
    deliveryDate,
    contactName,
    contactPhone,
    timeConstraint,
    machineModel,
    machineAccessories,
    serialNumber,
    installIdca,
    address: address ?? null,
    stairWalker,
    stairWalkerComment,
    parking,
    parkingComment,
    pickupModel,
    pickupAccessories,
    pickupSerial,
    pickupDisposal,
    specialInstructions,
    efexRef: null,
  }
}
