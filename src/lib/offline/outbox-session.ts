import { supabase } from "@/integrations/supabase/client";

/** Quem está com sessão iniciada (o autor de cada envio guardado na fila). */
export async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}
