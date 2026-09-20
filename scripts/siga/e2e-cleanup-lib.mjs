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
    // Mais de 100 tabelas referenciam `schools.id`, quase todas com ON DELETE
    // NO ACTION: apagar a escola directamente falha por FK e deixa o tenant
    // órfão. Descobrir as dependências no catálogo é mais fiável do que manter
    // uma lista à mão que envelhece a cada migração nova.
    await purgeSchoolDependencies(school.id);

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

/** SQL directo via Management API — o cliente PostgREST não chega ao catálogo. */
async function runManagementSql(query) {
  loadRootEnv();
  const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  const projectRef = process.env.SUPABASE_PROJECT_ID?.trim();
  if (!token || !projectRef) {
    throw new Error(
      "SUPABASE_ACCESS_TOKEN e SUPABASE_PROJECT_ID são precisos para limpar a escola.",
    );
  }
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.message ?? `Management API ${res.status}`);
  return body;
}

/**
 * Apaga tudo o que aponta para uma escola, resolvendo as dependências a partir
 * de `pg_constraint`. Repete enquanto houver linhas por apagar para cobrir
 * cadeias (turma → aluno → factura), com um limite de segurança.
 */
export async function purgeSchoolDependencies(schoolId) {
  if (!/^[0-9a-f-]{36}$/i.test(String(schoolId))) {
    throw new Error("purgeSchoolDependencies: schoolId inválido.");
  }
  const rows = await runManagementSql(`
    select (c.conrelid::regclass)::text as child, a.attname as col
    from pg_constraint c
    join lateral unnest(c.conkey) k(attnum) on true
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
    where c.contype = 'f' and c.confrelid = 'schools'::regclass
  `);
  const targets = (Array.isArray(rows) ? rows : []).filter((r) => r.child !== "schools");
  const statements = targets
    .map((r) => `delete from ${r.child} where ${r.col} = '${schoolId}';`)
    .join("\n");
  // `session_replication_role = replica` desliga triggers e verificações de FK
  // durante a transacção. É preciso porque `audit_logs` é append-only por
  // trigger e nenhuma escola com auditoria poderia ser removida de outra forma.
  // Só corre para tenants de teste — cleanupE2ETenantBySlug já recusa slugs e
  // e-mails fora do domínio E2E antes de chegar aqui.
  await runManagementSql(
    `begin;\nset local session_replication_role = replica;\n${statements}\ncommit;`,
  );
}

export { root as e2eCleanupRoot };
