import { createClient } from '@/lib/supabase/server'

/**
 * Call at the top of every API route handler.
 * Returns the authenticated user, or null if not authenticated.
 * If null, respond with 401 immediately.
 */
export async function requireAuth() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (!user || error) return null
  return user
}
