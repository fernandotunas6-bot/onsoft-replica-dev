import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveSgaMembership, sgaClient, type SgaMembershipContext } from "./sga";
import type { ApplicationRole } from "@/features/auth/access-policy";

export async function loadSgaAdminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return sgaClient(supabaseAdmin);
}

export async function requireSgaWriter(
  client: SupabaseClient,
  userId: string,
  roles: ApplicationRole[] = ["Administrador", "Secretaria", "Tesouraria"],
  preferredSchoolId?: string | null,
): Promise<SgaMembershipContext> {
  // Prefer service-role resolution after auth — same school/role truth for all writers.
  void client;
  const db = await loadSgaAdminClient();
  const membership = await resolveSgaMembership(db, userId, preferredSchoolId);
  if (!membership) throw new Error("Sem membership activa nesta escola.");
  if (!roles.includes(membership.appRole)) {
    throw new Error("Sem permissão para esta operação na escola.");
  }
  return membership;
}

/** Resolve membership/role for any authenticated user (read paths). */
export async function resolveSgaMembershipAdmin(
  userId: string,
  preferredSchoolId?: string | null,
): Promise<SgaMembershipContext | null> {
  const db = await loadSgaAdminClient();
  return resolveSgaMembership(db, userId, preferredSchoolId);
}
