/**
 * Honor Removals & Logistics — Business Logic Constants
 *
 * These values are per the FY2025-26 rate card and client confirmation.
 * Do NOT make fuel surcharge configurable in the UI — it is agreed at 11%
 * with override only for Fixed Price / Price Match special cases.
 */

/** Fuel surcharge rate — hardcoded at 11% per client agreement */
export const FUEL_SURCHARGE_RATE = 0.11

/** GST rate in Australia */
export const GST_RATE = 0.10

/** Current financial year */
export const CURRENT_FY = '2025-2026'

/** Job number prefix */
export const JOB_NUMBER_PREFIX = 'HRL'

/**
 * Calculate fuel surcharge and total price for a delivery job.
 * @param basePrice  - ex-GST base price
 * @param fuelOverride - if true, no fuel surcharge applied (Fixed Price / Price Match)
 */
export function calcDeliveryTotal(basePrice: number, fuelOverride = false): {
  fuelSurchargeAmt: number
  totalPrice: number
} {
  const fuelSurchargeAmt = fuelOverride ? 0 : basePrice * FUEL_SURCHARGE_RATE
  return {
    fuelSurchargeAmt: Math.round(fuelSurchargeAmt * 100) / 100,
    totalPrice: Math.round((basePrice + fuelSurchargeAmt) * 100) / 100,
  }
}

/**
 * Calculate GST and grand total for a billing cycle.
 */
export function calcBillingGST(subtotal: number): {
  gstAmount: number
  grandTotal: number
} {
  const gstAmount = Math.round(subtotal * GST_RATE * 100) / 100
  return {
    gstAmount,
    grandTotal: Math.round((subtotal + gstAmount) * 100) / 100,
  }
}
