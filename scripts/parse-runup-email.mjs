#!/usr/bin/env node
/**
 * Run-Up Job Email Parser — STUB
 *
 * Placeholder parser for run-up jobs coming via email.
 * Tolga will send an example email tomorrow — this stub will be fleshed out
 * once the email format is known.
 *
 * Integration: Called from poll-emails.mjs when a run-up job email is detected.
 */

/**
 * Detect if an email is a run-up job request.
 * TODO: Update patterns once Tolga provides example email format.
 */
export function isRunupJobRequest(subject, body, fromEmail) {
  const s = (subject || '').toLowerCase()
  // Placeholder detection — update once format is known
  if (s.includes('run-up') || s.includes('runup') || s.includes('run up')) {
    console.log('  🔧 runup job detected, pending parser config')
    return true
  }
  return false
}

/**
 * Parse run-up job details from email.
 * TODO: Implement once example email format is available.
 */
export function parseRunupEmail(subject, body, attachments = []) {
  console.log('  🔧 runup job detected, pending parser config')
  console.log('  📧 Subject:', subject)

  // Return minimal data — Tolga will configure fields once format is known
  return {
    jobType: 'runup',
    customerName: null,
    machineModel: null,
    serialNumber: null,
    scheduledDate: null,
    notes: `Auto-created run-up job — pending parser config.\nSubject: ${subject}`,
    raw: body,
  }
}
