import { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import type { Plan } from "@/features/saas/types";

export async function fetchActivePlans(): Promise<Plan[]> {
  const db = await loadSgaAdminClient();
  const { data, error } = await db
    .from("plans")
    .select("*")
    .eq("is_active", true)
    .order("price_aoa_monthly", { ascending: true });
  if (error) throw publicDatabaseError(error, "Não foi possível carregar os planos.");
  return (data as unknown as Plan[]) ?? [];
}
