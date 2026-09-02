import { createClient, isSupabaseConfigured } from "@/lib/supabase/client"

/** Token Bearer da sessão ADMIN (platform). */
export async function getAdminAccessToken(): Promise<string | undefined> {
  if (!isSupabaseConfigured()) return undefined
  const supabase = createClient()
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token
}
