import { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";
import { publicDatabaseError } from "@/integrations/supabase/server-error";

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
