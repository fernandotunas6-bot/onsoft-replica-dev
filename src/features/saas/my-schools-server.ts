/**
 * "As minhas escolas": a vista de quem administra mais do que uma escola.
 *
 * Cada escola continua isolada — os números vêm de consultas separadas, uma por
 * escola, sempre filtradas pelo `school_id` de um vínculo activo da própria
 * conta, e só das escolas onde a conta é Administrador. Trocar de escola
 * continua a ser o seletor do menu da conta (`setActiveSchoolId`).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadSgaAdminClient } from "@/integrations/supabase/sga-admin";
import { listUserSchoolMemberships } from "@/integrations/supabase/sga";

export type MySchoolSummary = {
  schoolId: string;
  name: string;
  slug: string | null;
  roles: string[];
  students: number | null;
  classGroups: number | null;
  staff: number | null;
  planName: string | null;
  tenantStatus: string | null;
  trialEndsAt: string | null;
};

/** Máximo de escolas resumidas de uma vez: cada uma custa quatro contagens. */
const MAX_SCHOOLS = 25;

type Db = Awaited<ReturnType<typeof loadSgaAdminClient>>;

async function countRows(db: Db, table: string, schoolId: string, status?: string) {
  let query = db
    .from(table as "students")
    .select("id", { count: "exact", head: true })
    .eq("school_id", schoolId);
  if (status) query = query.eq("status", status);
  const { count, error } = await query;
  return error ? null : (count ?? 0);
}

export const listMyAdministeredSchools = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MySchoolSummary[]> => {
    const db = await loadSgaAdminClient();
    const memberships = await listUserSchoolMemberships(db, context.userId);
    const administered = memberships
      .filter((m) => m.isActive && m.allAppRoles.includes("Administrador"))
      .slice(0, MAX_SCHOOLS);
    if (administered.length === 0) return [];

    const schoolIds = administered.map((m) => m.schoolId);
    const { data: schools } = await db.from("schools").select("id, tenant_id").in("id", schoolIds);
    const tenantBySchool = new Map(
      (schools ?? []).map((s) => [String(s.id), (s.tenant_id as string | null) ?? null]),
    );
    const tenantIds = [...new Set([...tenantBySchool.values()].filter(Boolean))] as string[];
    const { data: tenants } = tenantIds.length
      ? await db
          .from("tenants")
          .select("id, status, trial_ends_at, plans(name)")
          .in("id", tenantIds)
      : { data: [] };
    const tenantById = new Map(
      ((tenants ?? []) as Array<Record<string, unknown>>).map((t) => [String(t.id), t]),
    );

    return Promise.all(
      administered.map(async (m): Promise<MySchoolSummary> => {
        const [students, classGroups, staff] = await Promise.all([
          countRows(db, "students", m.schoolId, "active"),
          countRows(db, "class_groups", m.schoolId, "active"),
          countRows(db, "school_memberships", m.schoolId, "active"),
        ]);
        const tenantId = tenantBySchool.get(m.schoolId);
        const tenant = tenantId ? tenantById.get(tenantId) : undefined;
        const plan = tenant?.plans as { name?: string } | Array<{ name?: string }> | undefined;
        const planName = Array.isArray(plan) ? plan[0]?.name : plan?.name;
        return {
          schoolId: m.schoolId,
          name: m.schoolName,
          slug: m.schoolSlug,
          roles: m.allAppRoles,
          students,
          classGroups,
          staff,
          planName: planName ?? null,
          tenantStatus: (tenant?.status as string | undefined) ?? null,
          trialEndsAt: (tenant?.trial_ends_at as string | undefined) ?? null,
        };
      }),
    );
  });
