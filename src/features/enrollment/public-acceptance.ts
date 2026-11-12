import type { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import { getTenantAccessBlock } from "@/features/saas/tenant-access";

type Db = Awaited<ReturnType<typeof loadSgaAdminClient>>;

/**
 * O formulário público só recebe candidaturas de uma escola que pode trabalhar.
 * O bloqueio de uma escola suspensa, arquivada ou com o trial terminado vivia só
 * no ecrã do SIGA: o link público continuava aberto e as famílias candidatavam-se
 * a uma escola que não as podia receber (auditoria 13).
 *
 * Partilhado pelo formulário `/matricula/$slug` e pelo website da escola, para
 * o site nunca anunciar uma campanha que o formulário recusa.
 */
export async function schoolAcceptsPublicEnrollment(db: Db, schoolId: string): Promise<boolean> {
  const { data: school, error } = await db
    .from("schools")
    .select("status, tenant_id")
    .eq("id", schoolId)
    .maybeSingle();
  if (error) throw publicDatabaseError(error, "Não foi possível validar a escola.");
  if (!school || school.status === "archived") return false;
  if (!school.tenant_id) return true;
  const { data: tenant, error: tenantError } = await db
    .from("tenants")
    .select("status, subscription_status, trial_ends_at, billing_exempt")
    .eq("id", school.tenant_id)
    .maybeSingle();
  if (tenantError) throw publicDatabaseError(tenantError, "Não foi possível validar a escola.");
  return !getTenantAccessBlock(tenant as Parameters<typeof getTenantAccessBlock>[0] | null).blocked;
}
