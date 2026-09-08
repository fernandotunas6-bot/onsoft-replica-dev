import { loadSgaAdminClient, resolveSgaMembershipAdmin } from "@/integrations/supabase/sga-admin";
import { publicDatabaseError } from "@/integrations/supabase/server-error";
import type { ApplicationRole } from "@/features/auth/access-policy";

/**
 * Administrador da plataforma ≠ cargo escolar. Tabela `platform_admins`
 * (APPLY_SAAS_PLATFORM.sql). Sem createServerFn neste ficheiro.
 */
export async function requirePlatformAdmin(userId: string): Promise<void> {
  const db = await loadSgaAdminClient();
  const { data, error } = await db
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw publicDatabaseError(error, "Não foi possível confirmar acesso à plataforma.");
  if (!data) throw new Error("Sem permissão de administrador da plataforma.");
}

export type TenantAccessContext = { tenantId: string; tenantSlug: string; schoolId: string };

/**
 * Autoriza operações sobre um tenant e devolve a identidade resolvida no servidor.
 * O `tenantId` enviado pelo cliente é apenas confirmado contra a membership da
 * sessão — nunca serve, por si só, para localizar a escola. Sem isto, qualquer
 * conta autenticada podia gerir a identidade digital de outra escola.
 */
export async function requireTenantAccess(
  userId: string,
  tenantId: string,
  roles: ApplicationRole[] = ["Administrador"],
): Promise<TenantAccessContext> {
  const db = await loadSgaAdminClient();

  const membership = await resolveSgaMembershipAdmin(userId);
  let ownsTenant = false;
  if (membership && roles.includes(membership.appRole)) {
    const { data: ownSchool, error } = await db
      .from("schools")
      .select("tenant_id")
      .eq("id", membership.schoolId)
      .maybeSingle();
    if (error) throw publicDatabaseError(error, "Não foi possível confirmar a escola da sessão.");
    ownsTenant = ownSchool?.tenant_id === tenantId;
  }

  if (!ownsTenant) {
    try {
      await requirePlatformAdmin(userId);
    } catch {
      throw new Error("Sem permissão para gerir esta escola.");
    }
  }

  const [{ data: tenant, error: tenantError }, { data: school, error: schoolError }] =
    await Promise.all([
      db.from("tenants").select("slug").eq("id", tenantId).maybeSingle(),
      db.from("schools").select("id").eq("tenant_id", tenantId).maybeSingle(),
    ]);
  if (tenantError) throw publicDatabaseError(tenantError, "Não foi possível carregar a escola.");
  if (schoolError) throw publicDatabaseError(schoolError, "Não foi possível carregar a escola.");
  if (!tenant?.slug || !school?.id) throw new Error("Escola não encontrada para este tenant.");

  return { tenantId, tenantSlug: tenant.slug, schoolId: school.id };
}

export async function resolveBearerUserId(authorization: string | null): Promise<string> {
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token) throw new Error("Unauthorized");
  const db = await loadSgaAdminClient();
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new Error("Unauthorized");
  return data.user.id;
}

export async function requirePlatformAdminFromRequest(request: Request): Promise<string> {
  const userId = await resolveBearerUserId(request.headers.get("Authorization"));
  await requirePlatformAdmin(userId);
  return userId;
}

/** Sessão válida + flag `platform_admins` (para `/api/saas/me` no ADMIN). */
export async function resolvePlatformSessionFromRequest(
  request: Request,
): Promise<{ userId: string; platformAdmin: boolean; email?: string | null } | null> {
  try {
    const token = request.headers.get("Authorization")?.startsWith("Bearer ")
      ? request.headers.get("Authorization")!.slice(7).trim()
      : "";
    if (!token) return null;
    const db = await loadSgaAdminClient();
    const { data, error } = await db.auth.getUser(token);
    if (error || !data.user) return null;
    const userId = data.user.id;
    const { data: adminRow } = await db
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();
    return {
      userId,
      platformAdmin: Boolean(adminRow),
      email: data.user.email,
    };
  } catch {
    return null;
  }
}
