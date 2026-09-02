import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export const E2E_SLUG_PATTERN = /^(e2e|web|mat|gw)-[a-z0-9]+$/i;

export function loadRootEnv() {
  const envPath = resolve(root, ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

export function getSupabaseAdmin() {
  loadRootEnv();
  const url = process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim();
  const secret =
    process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !secret) {
    throw new Error("SUPABASE_URL e SUPABASE_SECRET_KEY são obrigatórios no .env");
  }
  return createClient(url, secret, { auth: { persistSession: false } });
}

export function isE2ETenantSlug(slug) {
  return E2E_SLUG_PATTERN.test(String(slug ?? "").trim());
}

/** Remove tenant E2E — só slugs e2e/web/mat e e-mail @siga-plus.test quando indicado. */
export async function cleanupE2ETenantBySlug(admin, slug, adminEmail) {
  if (!isE2ETenantSlug(slug)) {
    throw new Error(`Refusing cleanup: slug «${slug}» não parece tenant E2E.`);
  }
  if (adminEmail && !String(adminEmail).trim().toLowerCase().endsWith("@siga-plus.test")) {
    throw new Error("Refusing cleanup: e-mail admin fora do domínio de teste.");
  }

  const { data: tenant, error: tenantError } = await admin
    .from("tenants")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (tenantError) throw new Error(tenantError.message);
  if (!tenant?.id) return { removed: false };

  const tenantId = tenant.id;
  const { data: school } = await admin
    .from("schools")
    .select("id")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (school?.id) {
    const { error: schoolDeleteError } = await admin.from("schools").delete().eq("id", school.id);
    if (schoolDeleteError) throw new Error(schoolDeleteError.message);
  }

  await admin.from("tenant_domains").delete().eq("tenant_id", tenantId);
  await admin.from("subscriptions").delete().eq("tenant_id", tenantId);
  await admin.from("tenant_usage").delete().eq("tenant_id", tenantId);
  await admin.from("saas_audit_logs").delete().eq("tenant_id", tenantId);

  const { error: tenantDeleteError } = await admin.from("tenants").delete().eq("id", tenantId);
  if (tenantDeleteError) throw new Error(tenantDeleteError.message);

  if (adminEmail) {
    const target = String(adminEmail).trim().toLowerCase();
    const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const user = users.users.find((row) => row.email?.toLowerCase() === target);
    if (user?.id) {
      await admin.auth.admin.deleteUser(user.id).catch(() => undefined);
    }
  }

  return { removed: true, tenantId };
}

export { root as e2eCleanupRoot };
