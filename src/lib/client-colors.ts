export const CLIENT_COLORS: Record<string, string> = {
  'EFEX': '#f97316',
  'Fuji Solutions': '#3b82f6',
  'Evolved Digital': '#8b5cf6',
  'AXUS': '#10b981',
  'Mitronics': '#8B5CF6',
}

export const BILLING_CLIENTS = ['EFEX', 'AXUS', 'Evolved Digital', 'Fuji Solutions', 'Mitronics'] as const
export type BillingClientName = typeof BILLING_CLIENTS[number]

/** Short display labels for Kanban badges */
export const CLIENT_SHORT_NAMES: Record<string, string> = {
  'EFEX': 'EFEX',
  'Fuji Solutions': 'Fuji',
  'Evolved Digital': 'Evolved',
  'AXUS': 'AXUS',
  'Mitronics': 'Mitronics',
}

/**
 * Returns the hex color for a client.
 * Priority: DB color_code → CLIENT_COLORS map → slate fallback.
 * Handles null/undefined defensively for pre-migration rows.
 */
export function getClientColor(name?: string | null, colorCode?: string | null): string {
  if (colorCode) return colorCode
  if (name && CLIENT_COLORS[name]) return CLIENT_COLORS[name]
  return '#64748b'
}

export function getClientShortName(name?: string | null): string {
  if (!name) return ''
  return CLIENT_SHORT_NAMES[name] ?? name
}
