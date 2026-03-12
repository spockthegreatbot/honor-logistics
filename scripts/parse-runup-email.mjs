#!/usr/bin/env node
/**
 * Run-Up Job Email Parser
 *
 * Parses "OK To Install" emails forwarded by Tolga.
 * Subject format: "Fwd: FW: {Customer} | OK To Install | {City} | Q-{number}"
 *
 * Integration: Called from poll-emails.mjs when a run-up job email is detected.
 */

/**
 * Detect if an email is a run-up job request.
 * Matches subjects containing "OK To Install" (case-insensitive).
 */
export function isRunupJobRequest(subject, body, fromEmail) {
  const s = (subject || '').toLowerCase()
  return s.includes('ok to install')
}

/**
 * Strip common forwarding prefixes from a string.
 */
function stripPrefixes(str) {
  return (str || '').replace(/^(fwd?|fw|re)\s*:\s*/gi, '').replace(/^(fwd?|fw|re)\s*:\s*/gi, '').trim()
}

/**
 * Parse run-up job details from email subject and body.
 *
 * Subject pattern: "Fwd: FW: {Customer} | OK To Install | {City} | Q-{number}"
 *
 * Returns: { jobType, customerName, city, quoteNumber, jobNumber, notes, raw }
 */
export function parseRunupEmail(subject, body, attachments = []) {
  const cleanSubject = stripPrefixes(subject)

  // Split on pipe delimiter
  const parts = cleanSubject.split('|').map(p => p.trim())

  let customerName = null
  let city = null
  let quoteNumber = null

  if (parts.length >= 4) {
    // Format: Customer | OK To Install | City | Q-XXXXX
    customerName = parts[0] || null
    city = parts[2] || null
    quoteNumber = parts[3] || null
  } else if (parts.length === 3) {
    // Format: Customer | OK To Install | Q-XXXXX
    customerName = parts[0] || null
    quoteNumber = parts[2] || null
  } else if (parts.length === 2) {
    customerName = parts[0] || null
  }

  // Extract Q-number from wherever it appears
  const qMatch = cleanSubject.match(/Q-(\d+)/i)
  if (qMatch && !quoteNumber) {
    quoteNumber = `Q-${qMatch[1]}`
  } else if (quoteNumber && !quoteNumber.match(/^Q-/i)) {
    // If the last part has Q-XXXXX embedded, extract it
    const embedded = quoteNumber.match(/Q-(\d+)/i)
    if (embedded) quoteNumber = `Q-${embedded[1]}`
  }

  // Normalize Q-number
  const qNum = quoteNumber?.match(/Q-(\d+)/i)?.[1]
  const jobNumber = qNum ? `RUNUP-Q-${qNum}` : `RUNUP-${Date.now()}`

  // Try to extract additional details from the body
  let bodyDetails = ''
  if (body) {
    const bodyText = typeof body === 'string' ? body : ''
    // Look for useful content - addresses, dates, phone numbers, etc.
    const addressMatch = bodyText.match(/address[:\s]+([^\n]+)/i)
    const dateMatch = bodyText.match(/date[:\s]+([^\n]+)/i)
    const phoneMatch = bodyText.match(/(?:phone|tel|mobile|contact)[:\s]+([^\n]+)/i)
    const details = []
    if (addressMatch) details.push(`Address: ${addressMatch[1].trim()}`)
    if (dateMatch) details.push(`Date: ${dateMatch[1].trim()}`)
    if (phoneMatch) details.push(`Contact: ${phoneMatch[1].trim()}`)
    if (details.length > 0) bodyDetails = '\n' + details.join('\n')
  }

  return {
    jobType: 'runup',
    customerName,
    city,
    quoteNumber: quoteNumber || null,
    jobNumber,
    notes: `Run-up job — OK To Install\nSubject: ${subject}${bodyDetails}`,
    raw: body,
  }
}
